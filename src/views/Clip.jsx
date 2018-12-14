import React from 'react';
import {observer} from 'mobx-react';
import {Frame} from './Frame.jsx';
import Spinner from './Spinner.jsx';
import manager from 'utils/KeyboardManager.jsx';
import {SettingsContext, DataContext} from './contexts.jsx';
import VideoPlayer from './VideoPlayer.jsx';
import Consumer from 'utils/Consumer.jsx';
import _ from 'lodash';

const VideoState = Object.freeze({
  Off: Symbol('Off'),
  Loading: Symbol('Loading'),
  Showing: Symbol('Showing')
});

@observer
export default class Clip extends React.Component {
  state = {
    videoState: VideoState.Off,
    loopVideo: false,
    subAutoScroll: true,
    displayTime: null
  }

  fullScreen = false
  _currentTime = null
  _textTrack = null
  _lastDisplayTime = -1
  _formattedSubs = null
  _curSub = null
  _subDivs = null
  _n = null

  _onKeyPress = (e) => {
    if (manager.locked()) {
      return;
    }

    if (this._settingsContext.get('disable_playback')) {
      return;
    }

    let useJupyterKeys = this._settingsContext.get('jupyter_keybindings');
    let play_key = useJupyterKeys ? 'P' : 'p';
    let load_key = useJupyterKeys ? 'L' : 'l';
    let toggle_key = useJupyterKeys ? 'O' : ' ';

    let chr = String.fromCharCode(e.which);
    if (chr == play_key) {
      this.setState({
        videoState: VideoState.Loading,
        loopVideo: false
      });
    } else if (chr == load_key) {
      this.setState({
        videoState: VideoState.Loading,
        loopVideo: true
      });
    } else if (chr == toggle_key) {
      if (this._video) {
        let isPlaying = this._video.currentTime > 0 && !this._video.paused && !this._video.ended;
        if (isPlaying) {
          this._video.pause();
        } else {
          this._video.play();
        }
        e.stopPropagation();
        e.preventDefault();
      }
    }
  }

  _onMouseEnter = () => {
    document.addEventListener('keypress', this._onKeyPress);
  }

  _onMouseLeave = () => {
    document.removeEventListener('keypress', this._onKeyPress);

    if (!this.props.expand) {
      this.setState({videoState: VideoState.Off});
    }
  }

  _onLoadedData = () => {
    this.setState({videoState: VideoState.Showing});
  }

  _subDivScroll = (subDiv) => {
    return (subDiv.offsetTop + subDiv.clientHeight / 2) - this._subContainer.clientHeight / 2;
  }

  componentDidUpdate() {
    if (this.state.videoState == VideoState.Showing) {
      let updateFps = 24;
      if (this._timeUpdateInterval) {
        clearInterval(this._timeUpdateInterval);
      }
      this._timeUpdateInterval = setInterval(() => {
        // HACK FOR NOW: need to forcibly re-render every tick for subtitles to work properly
        this.forceUpdate();
      }, 1000 / updateFps);

      // Scroll captions to current time
      if (this._curSub !== null && this.state.subAutoScroll && this._subContainer !== null) {
        let subDiv = this._subDivs[this._curSub];
        this._subContainer.scrollTop = this._subDivScroll(subDiv);
      }
    } else {
      this._curSub = null;
      this._subDivs = null;

      // If the video disappears after being shown (e.g. b/c the clip was de-expanded)
      // we have to catch the interval clear then too
      if (this._timeUpdateInterval) {
        clearInterval(this._timeUpdateInterval);
      }
    }
  }

  _videoMeta = () => {
    return this._dataContext.tables.videos[this.props.clip.video];
  }

  _subOnScroll = (e) => {
    if (this.state.subAutoScroll) {
      return;
    }

    // TODO: change video time when scrolling
    let scroll = this._subContainer.scrollTop;

    let i;
    for (i = 0; i < _.size(this._subDivs); ++i) {
      if (scroll < this._subDivScroll(this._subDivs[i])) {
        break;
      }
    }

    i = Math.min(i, _.size(this._subDivs) - 1);

    this.setState({displayTime: this._formattedSubs[i].start});
  }

  _onTextTrackChange = (_e, player) => {
    let tracks = player.textTracks();
    if (tracks.length > 0) {
      this._textTrack = tracks[0];
    }
  }

  _onTimeUpdate = (e, player) => {
    this._currentTime = player.currentTime();
    if (this.state.videoState == VideoState.Showing) {
      if (this.props.onTimeUpdate) {
        this.props.onTimeUpdate(player.currentTime());
      }
    }
  }

  componentWillUnmount() {
    document.removeEventListener('keypress', this._onKeyPress);

    if (this._timeUpdateInterval) {
      clearInterval(this._timeUpdateInterval);
    }
  }

  width() {
    console.assert(this._n !== null);
    return this._n.clientWidth;
  }

  render() {
    return (
      <Consumer contexts={[SettingsContext, DataContext]}>{(settingsContext, dataContext) => {
          this._dataContext = dataContext;
          this._settingsContext = settingsContext;

          let clip = this.props.clip;
          let video = this._videoMeta();
          let show_subs = settingsContext.get('subtitle_sidebar');

          let max_width = 1140;
          let max_height = video.height * max_width / video.width;

          // Figure out how big the thumbnail should be
          let small_height = this.props.expand ? video.height : 100 * settingsContext.get('thumbnail_size');
          let small_width = video.width * small_height / video.height;

          if (small_width > max_width) {
            small_width = max_width;
            small_height = max_height;
          }

          // Determine which video frame to display
          let display_frame =
            clip.hasOwnProperty('display_frame')
            ? clip.display_frame
            : (settingsContext.get('show_middle_frame') && clip.max_frame
                ? Math.round((clip.max_frame + clip.min_frame) / 2)
                : clip.min_frame);

          let asset_url = (path) => {
            if (window.IPython) {
              return `/django/${path}`;
            } else {
              return path;
            }
          };

          let thumbnail_path = asset_url(
            `${settingsContext.get('endpoints').frames}?path=${encodeURIComponent(video.path)}&frame=${display_frame}`);

          // Collect inline metadata to display
          let meta = [];

          if (this.props.expand) {
            meta.push(['Video', `${video.path.split(/[\\/]/).pop()} (${video.id})`]);
            meta.push(['Frame', `${display_frame}`]);
          }

          if (clip.max_frame !== undefined) {
            let duration = (clip.max_frame - clip.min_frame) / video.fps;
            meta.push(['Duration', `${duration.toFixed(1)}s`]);
          }

          if (clip.objects !== undefined) {
            meta.push(['# objects', `${clip.objects.length}`]);
          }

          if (clip.metadata !== undefined) {
            clip.metadata.forEach((entry) => {
              meta.push([entry[0], entry[1]]);
            });
          }

          let meta_per_row = this.props.expand ? 4 : 2;
          let td_style = {width: `${100 / meta_per_row}%`};

          let sub_width = this.props.expand ? 480 : 50;
          let subStyle = {
            width: sub_width,
            fontSize: this.props.expand ? '14px' : '12px'
          };

          let Subtitle = () => {
            if (!this._textTrack) {
              return <span>Loading track...</span>
            }

            let subs = this._textTrack.cues;
            if (!subs || subs.length == 0) {
              return <span>Loading subtitles...</span>
            }

            // TODO: is there a proper way to cache this? We can't just compute it on the first
            // go since the text tracks are streamed in, not loaded all in at once.
            this._formattedSubs = [];
            let curSub = "";
            let startTime = 0;
            _.forEach(subs, (sub) => {
              let parts = sub.text.split('>>');

              let fmtSub = (sub, text) => {
                if (sub.startTime <= this._currentTime && this._currentTime <= sub.endTime) {
                return '<strong>' + text + '</strong>';
                } else {
                  return text;
                }
              }

              if (curSub != '' || parts.length > 1) {
                // We are constructing the current subtitle track from a
                // previous '>>'

                curSub += fmtSub(sub, parts[0]) + ' ';
                if (parts.length > 1) {
                  this._formattedSubs.push({
                    text: _.trim(curSub),
                    start: startTime,
                    end: sub.endTime
                  })

                  startTime = sub.startTime;
                  parts.slice(1, -1).forEach((text) => {
                    this._formattedSubs.push({
                      text: _.trim(fmtSub(sub, text)),
                      start: startTime,
                      end: sub.endTime
                    })
                  });

                  curSub = fmtSub(sub, parts[parts.length - 1]);
                }
              } else {
                // We have not detected a '>>' in this subtitle track
                curSub = fmtSub(sub, parts[0]) + ' ';
                this._formattedSubs.push({
                  text: _.trim(curSub),
                  start: sub.startTime,
                  end: sub.endTime
                })
                curSub = '';
              }
            });

            let i = 0;
            while (i < this._formattedSubs.length && this._formattedSubs[i].start <= this._currentTime) {
              i++;
            }

            this._curSub = Math.max(i - 1, 0);
            this._subDivs = {};
            return <div>{this._formattedSubs.map((sub, j) => {
                let mkup = {__html: `>>> ${sub.text}`};
                return <div key={j} className='subtitle' ref={(n) => { this._subDivs[j] = n; }}>
                  {this._curSub == j
                   ? <span className="emph" dangerouslySetInnerHTML={mkup} />
                   : <span dangerouslySetInnerHTML={mkup} />}
                </div>;
            })}
            </div>;
          };

          return <div className={`clip ${(this.props.expand ? 'expanded' : '')}`}
                      onMouseEnter={this._onMouseEnter}
                      onMouseLeave={this._onMouseLeave}
                      ref={(n) => {this._n = n;}}>
            <div className='video-row' style={{height: small_height}}>
              <div className='media-container' data-vjs-player>
                {!settingsContext.get('disable_playback') && (this.state.videoState == VideoState.Loading || this.state.videoState == VideoState.Showing)
                 ? <div style={{display: this.state.videoState == VideoState.Showing ? 'block' : 'none'}}>
                   <VideoPlayer
                     video={asset_url(`${settingsContext.get('endpoints').videos}/${video.path}`)}
                     captions={video.srt_extension != '' ?
                               asset_url(`${settingsContext.get('endpoints').subtitles}?video=${video.id}`) : null}
                     onLoadedData={this._onLoadedData}
                     onTextTrackChange={this._onTextTrackChange}
                     onTimeUpdate={this._onTimeUpdate}
                     width={small_width}
                     height={small_height}
                     track={this.props.clip}
                     playbackRate={settingsContext.get('playback_speed')}
                     displayTime={this.state.displayTime || this.props.displayTime} />
                 </div>
                 : null}
                {this.state.videoState == VideoState.Loading
                 ? <div className='loading-video'><Spinner /></div>
                 : null}
                {this.state.videoState == VideoState.Loading || this.state.videoState == VideoState.Off
                 ? <Frame
                  bboxes={clip.objects || []}
                  small_width={small_width}
                  small_height={small_height}
                  full_width={Math.min(video.width, max_width)}
                  full_height={Math.min(video.height, max_height)}
                  onClick={this.props.onBoxClick}
                  expand={this.props.expand}
                  onChangeGender={() => {}}
                  onChangeLabel={() => {}}
                  onTrack={() => {}}
                  onSetTrack={() => {}}
                  onDeleteTrack={() => {}}
                  onSelect={() => {}}
                  path={thumbnail_path}
                  enableLabel={this.props.enableLabel} />
                 : null}
              </div>
              {show_subs && this.props.expand && this.state.videoState == VideoState.Showing
               ? <div className='sub-container' style={subStyle}>
                 <button className='sub-autoscroll' onClick={() => {
                     this.setState({subAutoScroll: !this.state.subAutoScroll});
                 }}>
                   {this.state.subAutoScroll ? 'Disable autoscroll' : 'Enable autoscroll'}
                 </button>
                 <div className='sub-scroll' onScroll={this._subOnScroll}
                      style={{overflow: this.state.subAutoScroll ? 'hidden' : 'auto'}}
                      ref={(n) => {this._subContainer = n;}}>
                   <Subtitle />
                 </div>
               </div>
               : null}
            </div>
            {(this.props.expand || settingsContext.get('show_inline_metadata')) && this.props.showMeta
             ?
             <table className='search-result-meta' style={{width: small_width}}>
               <tbody>
                 {_.range(Math.ceil(meta.length/meta_per_row)).map((i) =>
                   <tr key={i}>
                     {_.range(meta_per_row).map((j) => {
                        let entry = meta[i*meta_per_row + j];
                        if (entry === undefined) { return <td key={j} />; }
                        return (<td key={j} style={td_style}><strong>{entry[0]}</strong>: {entry[1]}</td>);
                     })}
                   </tr>)}
               </tbody>
             </table>
             : null}
          </div>
      }}</Consumer>
    );
  }
}

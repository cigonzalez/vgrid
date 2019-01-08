import React from 'react';
import {observer} from 'mobx-react';
import {SettingsContext, DataContext} from './contexts';
import Spinner from './Spinner.jsx';
import Consumer from 'utils/Consumer.jsx';
import keyboardManager from 'utils/KeyboardManager.jsx';
import Select from './Select.jsx';

let gender_colors = {'M': '#50c9f8', 'F': '#ff6d86', 'U': '#c0ff00'};

export let boundingRect = (div) => {
  let r = div.getBoundingClientRect();
  return {
    left: r.left + document.body.scrollLeft,
    top: r.top + document.body.scrollTop,
    width: r.width,
    height: r.height
  };
};

// TODO(wcrichto): if you move a box and mouseup outside the box, then the mouseup doesn't
// register with the Box

@observer
class Box extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      clickX: -1,
      clickY: -1,
      clicked: false,
      mouseX: -1,
      mouseY: -1,
      showSelect: false
    };
  }

  // See "Bind functions early" https://mobx.js.org/best/react-performance.html
  // for why we use this syntax for member functions.
  _onMouseDown = (e) => {
    console.log(this.props.box.id);

    if (this.props.onClick) {
      this.props.onClick(this.props.box);
    }
    e.stopPropagation();

    this.setState({
      clicked: true,
      clickX: e.clientX,
      clickY: e.clientY,
      mouseX: e.clientX,
      mouseY: e.clientY
    });

    // Since we rely on global clicks and not just React's synthetic click events to make the drawing work,
    // we need to stop propagation of the native DOM event as well. See Frame._onMouseDownGlobal for related bug.
    // https://stackoverflow.com/questions/24415631/reactjs-syntheticevent-stoppropagation-only-works-with-react-events
    e.nativeEvent.stopImmediatePropagation();
  }

  _onMouseMove = (e) => {
    if (!this.state.clicked) { return; }
    this.setState({
      mouseX: e.clientX,
      mouseY: e.clientY
    });
  }

  _onMouseUp = (e) => {
    if (this.state.clicked) {
      let box = this.props.box;
      let {width, height} = this.props;
      let offsetX = this.state.mouseX - this.state.clickX;
      let offsetY = this.state.mouseY - this.state.clickY;
      box.bbox_x1 += offsetX / width;
      box.bbox_x2 += offsetX / width;
      box.bbox_y1 += offsetY / height;
      box.bbox_y2 += offsetY / height;
      this.setState({clicked: false});
    }
  }

  _onMouseOver = (e) => {
    document.addEventListener('keypress', this._onKeyPress);
  }

  _onMouseOut = (e) => {
    document.removeEventListener('keypress', this._onKeyPress);
  }

  _onKeyPress = (e) => {
    let chr = String.fromCharCode(e.which);
    if (keyboardManager.locked()) {
      return;
    }

    let box = this.props.box;
    let {width, height} = this.props;
    let processed = true;
    if (chr == 'g') {
      let keys = _.sortBy(_.map(_.keys(this._dataContext.categories.genders), (x) => parseInt(x)));
      box.gender_id = keys[(_.indexOf(keys, box.gender_id) + 1) % keys.length];
      // TODO(wcrichto): mobx should catch this update, but doesn't?
      this.forceUpdate();
      e.preventDefault();
    } else if (chr == 'b') {
      box.background = !box.background;
      this.forceUpdate();
      e.preventDefault();
    } else if (chr == 'd') {
      this.props.onDelete(this.props.i);
    } else if(chr == 't') {
      this.setState({showSelect: !this.state.showSelect});
      //this.props.onTrack(this.props.i);
    } else if(chr == 'q') {
      this.props.onSetTrack(this.props.i);
    } else if(chr == 'u') {
      this.props.onDeleteTrack(this.props.i);
    } else {
      processed = false;
    }

    // NOTE(wcrichto) 6-21-18: if you press 't' on a bbox, then seems like select is receiving 't' as input
    // as well, so preventDefault should stop that from happening
    if (processed) {
      e.preventDefault();
    }
  }

  _onSelect = (option) => {
    this.props.box.identity_id = parseInt(option.value);
    this.setState({showSelect: false});
  }

  componentDidMount() {
    document.addEventListener('mousemove', this._onMouseMove);
  }

  componentWillUnmount() {
    document.removeEventListener('keypress', this._onKeyPress);
    document.removeEventListener('mousemove', this._onMouseMove);
  }

  render() {
    return (
      <Consumer contexts={[SettingsContext, DataContext]}>{(settingsContext, dataContext) => {
          this._dataContext = dataContext;
          let box = this.props.box;
          let offsetX = 0;
          let offsetY = 0;
          if (this.state.clicked) {
            offsetX = this.state.mouseX - this.state.clickX;
            offsetY = this.state.mouseY - this.state.clickY;
          }

          let color =
            box.gender_id !== undefined
            ? gender_colors[this._dataContext.categories.genders[box.gender_id].name]
            : 'yellow';

          let style = {
            left: box.bbox_x1 * this.props.width + offsetX,
            top: box.bbox_y1 * this.props.height + offsetY,
            width: (box.bbox_x2-box.bbox_x1) * this.props.width,
            height: (box.bbox_y2-box.bbox_y1) * this.props.height,
            borderColor: color,
            borderStyle: box.background ? 'dashed' : 'solid',
            opacity: settingsContext.get('annotation_opacity')
          };


          let selectStyle = {
            left: style.left + style.width + 5,
            top: style.top,
            position: 'absolute',
            zIndex: 1000
          };

          let labelStyle = {
            left: style.left,
            bottom: this.props.height - style.top,
            backgroundColor: style.borderColor,
            fontSize: this.props.expand ? '12px' : '8px',
            padding: this.props.expand ? '3px 6px' : '0px 1px'
          };

          let modifyLabel = ((label) => {
            if (this.props.expand) {
              return label;
            } else {
              let parts = label.split(' ');
              if (parts.length > 1) {
                return parts.map((p) => p[0]).join('').toUpperCase();
              } else {
                return label;
              }
            }
          }).bind(this);

          let label_text = null;
          if (box.identity_id || box.actor_id || box.character_id) {
            if (box.identity_id) {
              label_text = this._dataContext.categories.identities[box.identity_id].name
            } else if (box.actor_id) {
              label_text = this._dataContext.categories.actors[box.actor_id].name
            } else if (box.character_id) {
              label_text = this._dataContext.categories.characters[box.character_id].name
            }
          }

          return (<div>
            {label_text
             ? <div className='bbox-label' style={labelStyle}>
               {modifyLabel(label_text)}
             </div>
             : null}
            <div onMouseOver={this._onMouseOver}
                 onMouseOut={this._onMouseOut}
                 onMouseUp={this._onMouseUp}
                 onMouseDown={this._onMouseDown}
                 className='bounding-box'
                 style={style}
                 ref={(n) => {this._div = n}} />
            {this.state.showSelect
             ? <div style={selectStyle}>
               <Select
                 data={_.map(this._dataContext.categories.identities, (v, k) => [k, v.name])}
                 multi={false}
                 width={this.props.expand ? 200 : 100}
                 onSelect={this._onSelect}
                 onClose={(e) => {this.setState({showSelect: false});}}
               />
             </div>
             : null}
          </div>);
      }}</Consumer>);
  }
}

let POSE_PAIRS = [[1,2], [1,5], [2,3], [3,4], [5,6], [6,7], [1,8], [8,9], [9,10],  [1,11],  [11,12], [12,13],  [1,0], [0,14], [14,16],  [0,15], [15,17]];

let POSE_LEFT = [2, 3, 4, 8, 9, 10, 14, 16];

let FACE_PAIRS = [
  [0,1], [1,2], [2,3], [3,4], [4,5], [5,6], [6,7], [7,8], [8,9], [9,10], [10,11], [11,12], [12,13], [13,14], [14,15], [15,16], [17,18], [18,19], [19,20], [20,21], [22,23], [23,24], [24,25], [25,26], [27,28], [28,29], [29,30], [31,32], [32,33], [33,34], [34,35], [36,37], [37,38], [38,39], [39,40], [40,41], [41,36], [42,43], [43,44], [44,45], [45,46], [46,47], [47,42], [48,49], [49,50], [50,51], [51,52], [52,53], [53,54], [54,55], [55,56], [56,57], [57,58], [58,59], [59,48], [60,61], [61,62], [62,63], [63,64], [64,65], [65,66], [66,67], [67,60]];

let HAND_PAIRS = [
  [0,1], [1,2], [2,3], [3,4], [0,5], [5,6], [6,7], [7,8], [0,9], [9,10], [10,11], [11,12], [0,13], [13,14], [14,15], [15,16], [0,17], [17,18], [18,19], [19,20]
];

let POSE_COLOR = 'rgb(255, 60, 60)';
let POSE_LEFT_COLOR = 'rgb(23, 166, 250)';
let FACE_COLOR = 'rgb(240, 240, 240)';
let HAND_LEFT_COLOR = 'rgb(233, 255, 49)';
let HAND_RIGHT_COLOR = 'rgb(95, 231, 118)';

@observer
class Pose extends React.Component {
  render() {
    return <SettingsContext.Consumer>{settingsContext => {
        let w = this.props.width;
        let h = this.props.height;
        let all_kp = this.props.pose.keypoints;
        let opacity = settingsContext.get('annotation_opacity');
        let kp_sets = [];

        // Conditionally draw each part of the keypoints depending on our options
        if (settingsContext.get('show_pose')) {
          kp_sets.push([all_kp.pose, POSE_PAIRS, POSE_COLOR]);
        }
        if (settingsContext.get('show_face')) {
          kp_sets.push([all_kp.face, FACE_PAIRS, FACE_COLOR]);
        }
        if (settingsContext.get('show_hands')) {
          kp_sets = kp_sets.concat([
            [all_kp.hand_left, HAND_PAIRS, HAND_LEFT_COLOR],
            [all_kp.hand_right, HAND_PAIRS, HAND_RIGHT_COLOR],
          ])
        }

        let expand = this.props.expand;
        let strokeWidth = this.props.expand ? 3 : 1;

        let get_color = (kp_set, pair) => {
          let color = kp_set[2];
          // Normally color is just the one in the kp_set, but we special case drawing
          // the left side of the pose a different color if the option is enabled
          if (settingsContext.get('show_lr') &&
              kp_set[0].length == all_kp.pose.length &&
              (_.includes(POSE_LEFT, pair[0]) || _.includes(POSE_LEFT, pair[1]))) {
            color = POSE_LEFT_COLOR;
          }
          return color;
        };

        return <svg className='pose'>
          {kp_sets.map((kp_set, j) =>
            <g key={j}>
              {expand
               ? kp_set[0].map((kp, i) => [kp, i]).filter((kptup) => kptup[0][2] > 0).map((kptup, i) =>
                 <circle key={i} r={2} cx={kptup[0][0] * w} cy={kptup[0][1] * h}
                         stroke={get_color(kp_set, [kptup[1], kptup[1]])}
                         strokeOpacity={opacity} strokeWidth={strokeWidth} fill="transparent" />
               )
               : <g />}
              {kp_set[1].filter((pair) => kp_set[0][pair[0]][2] > 0 && kp_set[0][pair[1]][2] > 0).map((pair, i) =>
                <line key={i} x1={kp_set[0][pair[0]][0] * w} x2={kp_set[0][pair[1]][0] * w}
                      y1={kp_set[0][pair[0]][1] * h} y2={kp_set[0][pair[1]][1] * h}
                      strokeWidth={strokeWidth} stroke={get_color(kp_set, pair)}
                      strokeOpacity={opacity} />
              )}
            </g>
          )}
        </svg>
    }}</SettingsContext.Consumer>;
  }
}

let LANDMARKS_COLOR='rgb(255, 255, 255)';
let LANDMARK_LABELS = [
  'face_outline', 'right_eyebrow', 'left_eyebrow', 'nose_bridge', 'nose_bottom',
  'right_eye', 'left_eye', 'outer_lips', 'inner_lips'];

@observer
class FaceLandmarks extends React.Component {
  render() {
    return <SettingsContext.Consumer>{settingsContext => {
        let w = this.props.width;
        let h = this.props.height;
        let opacity = settingsContext.get('annotation_opacity');
        let all_landmarks = this.props.landmarks.landmarks;
        let landmark_sets = []

        let i = 0;
        for (i = 0; i < LANDMARK_LABELS.length; i++) {
          landmark_sets.push(all_landmarks[LANDMARK_LABELS[i]])
        }

        let expand = this.props.expand;
        let strokeWidth = this.props.expand ? 3 : 1;
        let color = LANDMARKS_COLOR;

        return <svg className='landmarks'>
          {landmark_sets.map((landmark_set, j) =>
            <g key={j}>
              {landmark_set.map((landmark, i) =>
                 <circle key={i} r={strokeWidth} cx={landmark[0] * w} cy={landmark[1] * h}
                         stroke={color}
                         strokeOpacity={opacity}
                         strokeWidth={0}
                         fill={color} />
              )}
              <polyline key={i}
                  points = {landmark_set.reduce(((points, landmark) =>
                      points + (landmark[0] * w + "," + landmark[1] * h + " ")
                  ), "")}
                  stroke={color}
                  strokeOpacity={opacity}
                  strokeWidth={1}
                  fill="transparent" />
            </g>
          )}
        </svg>

    }}</SettingsContext.Consumer>;
  }
}

// ProgressiveImage displays a loading gif (the spinner) while an image is loading.
class ProgressiveImage extends React.Component {
  state = {
    loaded: false
  }

  _onLoad = () => {
    this.setState({loaded: true});
    if (this.props.onLoad) {
      this.props.onLoad();
    }
  }

  _onError = () => {
    // TODO(wcrichto): handle 404 on image (theoretically shouldn't happen, but...)
  }

  componentWillReceiveProps(props) {
    if (this.props.src != props.src) {
      this.setState({loaded: false});
    }
  }

  render() {
    let width = this.props.width;
    let height = this.props.height;
    let target_width = this.props.target_width;
    let target_height = this.props.target_height;
    let crop  = this.props.crop;
    let cropStyle;
    if (crop !== null) {
      let bbox_width = crop.bbox_x2 - crop.bbox_x1;
      let bbox_height = crop.bbox_y2 - crop.bbox_y1;
      let scale;
      if (this.props.target_height !== null) {
        scale = this.props.target_height / (bbox_height * height);
      } else {
        scale = this.props.target_width / (bbox_width * width);
      }
      cropStyle = {
        backgroundImage: `url(${this.props.src})`,
        backgroundPosition: `-${crop.bbox_x1 * width * scale}px -${crop.bbox_y1 * height * scale}px`,
        backgroundSize: `${width * scale}px ${height * scale}px`,
        backgroundStyle: 'no-repeat',
        width: bbox_width * width * scale,
        height: bbox_height * height * scale
      }
    } else {
      cropStyle = {};
    }
    let imgStyle = {
      display: (this.state.loaded && crop === null) ? 'inline-block' : 'none',
      width: target_width === null ? 'auto' : target_width,
      height: target_height === null ? 'auto' : target_height
    };
    return (
      <div>
        {this.state.loaded
         ? null
         : <Spinner />}
        <img src={this.props.src} draggable={false} onLoad={this._onLoad} onError={this._onError} style={imgStyle} />
        {crop !== null
         ? <div style={cropStyle} />
         : null}
      </div>
    );
  }
}

@observer
export class Frame extends React.Component {
  // Frame encodes a fairly complicated state machine that enables intuitive bounding box drawing. See the various
  // mouse event methods for more details.

  // TODO(wcrichto): right now there's an odd behavior that allows simultaneous creation of two bounding boxes when
  // starting to draw in one frame and mousing into another. How to avoid this without a global event coordinator?

  state = {
    startX: -1,
    startY: -1,
    curX: -1,
    curY: -1,
    expand: false,
    imageLoaded: false,
    clicked: false,
    showDraw: false
  }

  _onMouseOver = (e) => {
    document.addEventListener('keypress', this._onKeyPress);

    // When the user mouses into a frame, a bounding box should be drawn
    this.setState({showDraw: true});
  }

  _onMouseOut = (e) => {
    document.removeEventListener('keypress', this._onKeyPress);

    // This handles the case where the user starts drawing a bounding box, mouses out of the frame, and releases the mouse.
    // mouseout is triggered when the mouse exits to sub-div on the same layer, e.g. a bounding box in the current frame
    // as well as when the mouse exits to a different frame. We want to distinguish between these two cases so the reset
    // only occurs when exiting the frame.
    // See "Mousing out of a layer": https://www.quirksmode.org/js/events_mouse.html
    let rel_target = e.relatedTarget;

    // Corner case if the user clicks, tabs out, then comes back (and perhaps others?).
    if (rel_target == null) {
      return;
    }

    while (rel_target != this._div && rel_target.nodeName != 'HTML') {
      rel_target = rel_target.parentNode;
    }

    // If the user left the current frame, then reset drawing state.
    if (rel_target != this._div && !this.state.clicked) {
      this.setState({showDraw: false});
    }
  }


  _onMouseDownLocal = (e) => {
    if (!this.props.enableLabel) { return; }

    // If the user clicks directly on a frame, we treat it the same as a global click, except we also register the direct
    // click so that moving outside of the frame doesn't cause the box to disappear. We don't need to set showDraw since
    // the user has to be moused in for the mouse down to register, so it would be redundant.
    let rect = boundingRect(this._div);
    let [startX, startY] = this._clampCoords(e.clientX - rect.left, e.clientY - rect.top);
    this.setState({
      startX: startX,
      startY: startY,
      clicked: true
    });
  }

  _onMouseDownGlobal = (e) => {
    let rect = boundingRect(this._div);

    // For some reason, nativeEvent.stopImmediatePropagation() stops propagation on the global mouse down events for
    // every div _except_ the one that was actually clicked...
    if (rect.left <= e.clientX && e.clientX <= rect.left + rect.width &&
        rect.top <= e.clientY && e.clientY <= rect.top + rect.height) {
      return;
    }

    // If the user clicks anywhere on the page, register the click, but don't draw a bounding box until the user mouses in.
    let [startX, startY] = this._clampCoords(e.clientX - rect.left, e.clientY - rect.top);
    this.setState({
      startX: startX,
      startY: startY
    });
  }

  _clampCoords = (x, y) => {
    let rect = boundingRect(this._div);
    let clamp = (n, a, b) => { return Math.max(Math.min(n, b), a); };
    return [clamp(x, 0, rect.width), clamp(y, 0, rect.height)];
  }

  _onMouseMove = (e) => {
    let rect = boundingRect(this._div);
    let curX = e.clientX - rect.left;
    let curY = e.clientY - rect.top;
    let [newX, newY] = this._clampCoords(curX, curY);
    // Not very functional, but since this method is run for every frame on screen, it avoids unnecessary redraws since
    // the bounding box won't change for most frames at a time when clamped.
    if (newX != this.state.curX || newY != this.state.curY) {
      this.setState({curX: newX, curY: newY});
    }
  }

  _onMouseUpLocal = (e) => {
    // Create the box when the user releases the mouse.
    if (this.state.startX != -1 && this.state.showDraw) {
      if (keyboardManager.modifiers.has('shift')) {
        this.props.bboxes.push(this._makeBox());
      }

      this.setState({startX: -1, clicked: false});
      this.props.onSelect(this.props.ni);
    }
  }

  _onMouseUpGlobal = (e) => {
    if (this.state.startX != -1) {
      // Only save the bounding box if it is being shown. This allows for the user to start drawing a bbox inside of a
      // frame, mouse out of the frame, and still register the clamped bbox.
      if (this.state.showDraw) {
        this._onMouseUpLocal(e);
      } else {
        this.setState({startX: -1, clicked: false});
      }
    }
  }

  _onKeyPress = (e) => {
    let chr = String.fromCharCode(e.which);
    if (chr == 's') {
      this.props.onSelect(this.props.ni);
    }
  }

  _onDelete = (i) => {
    this.props.bboxes.splice(i, 1);
  }

  _onTrack = (i) => {
    let box = this.props.bboxes[i];
    this.props.onTrack(box);
  }

  _onSetTrack = (i) => {
    let box = this.props.bboxes[i];
    this.props.onSetTrack(box);
  }

  _onDeleteTrack = (i) => {
    let box = this.props.bboxes[i];
    this.props.onDeleteTrack(box);
  }

  _makeBox() {
    let width = this.props.small_width;
    let height = this.props.small_height;
    return {
      bbox_x1: (Math.min(this.state.startX, this.state.curX) + 1)/width,
      bbox_y1: (Math.min(this.state.startY, this.state.curY) + 1)/height,
      bbox_x2: (Math.max(this.state.curX, this.state.startX) - 1)/width,
      bbox_y2: (Math.max(this.state.curY, this.state.startY) - 1)/height,
      labeler_id: _.find(this._dataContext.tables.labelers, (l) => l.name == 'handlabeled-face').id,
      gender_id: _.find(this._dataContext.categories.genders, (l) => l.name == 'U').id,
      type: 'bbox',
      id: -1,
      background: false
    }
  }

  componentWillReceiveProps(props) {
    if (this.props.path != props.path) {
      this.setState({imageLoaded: false});
    }
  }

  componentWillMount() {
    if (this.props.enableLabel) {
      document.addEventListener('mousedown', this._onMouseDownGlobal);
      document.addEventListener('mouseup', this._onMouseUpGlobal);
      document.addEventListener('mousemove', this._onMouseMove);
    }
  }

  componentWillUnmount() {
    if (this.props.enableLabel) {
      document.removeEventListener('mousedown', this._onMouseDownGlobal);
      document.removeEventListener('mouseup', this._onMouseUpGlobal);
      document.removeEventListener('mousemove', this._onMouseMove);
    }
    document.removeEventListener('keypress', this._onKeyPress);
  }

  render() {
    return (
      <Consumer contexts={[SettingsContext, DataContext]}>{(settingsContext, dataContext) => {
          this._dataContext = dataContext;
          return <div className='frame'
                      onMouseDown={this._onMouseDownLocal}
                      onMouseUp={this._onMouseUpLocal}
                      onMouseOver={this._onMouseOver}
                      onMouseOut={this._onMouseOut}
                      ref={(n) => { this._div = n; }}>
            {settingsContext.get('crop_bboxes') && this.props.bboxes.length > 0 && !this.props.expand
             ? <ProgressiveImage
                 src={this.props.path}
                 crop={this.props.bboxes[0]}
                 width={this.props.full_width}
                 height={this.props.full_height}
                 target_width={this.props.small_width}
                 target_height={this.props.small_height}
                 onLoad={() => this.setState({imageLoaded: true})} />
             : <div>
               {this.state.imageLoaded
                ? <div>
                  {this.state.showDraw && this.state.startX != -1 && keyboardManager.modifiers.has('shift')
                   ? <Box box={this._makeBox()} width={this.props.small_width}
                              height={this.props.small_height} />
                   : null}
                  {this.props.bboxes.map((box, i) => {
                     if (box.type == 'bbox') {
                       return <Box box={box} key={i} i={i} width={this.props.small_width}
                                       height={this.props.small_height}
                                       onClick={this.props.onClick}
                                       onDelete={this._onDelete}
                                       onTrack={this._onTrack}
                                       onSetTrack={this._onSetTrack}
                                       onDeleteTrack={this._onDeleteTrack}
                                       expand={this.props.expand} />;
                     } else if (box.type == 'pose') {
                       return <Pose pose={box} key={i} width={this.props.small_width}
                                        height={this.props.small_height} expand={this.props.expand} />;
                     } else if (box.type == 'face_landmarks') {
                       return <FaceLandmarks landmarks={box} key={i} width={this.props.small_width}
                                        height={this.props.small_height} expand={this.props.expand} />;
                     }})}
                </div>
                : null}
               <ProgressiveImage
                 src={this.props.path}
                 width={this.props.full_width}
                 height={this.props.full_height}
                 crop={null}
                 target_width={this.props.small_width}
                 target_height={this.props.small_height}
                 onLoad={() => this.setState({imageLoaded: true})} />
             </div>}
          </div>;
      }}</Consumer>
    );
  }
};

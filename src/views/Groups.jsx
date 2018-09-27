import React from 'react';
import * as Rb from 'react-bootstrap';
import _ from 'lodash';
import {observer} from 'mobx-react';
import Clip from './Clip.jsx';
import Timeline from './Timeline.jsx';
import axios from 'axios';
import {DataContext, SettingsContext, PythonContext} from './contexts.jsx';
import keyboardManager from 'utils/KeyboardManager.jsx';
import Consumer from 'utils/Consumer.jsx';
import Provider from 'utils/Provider.jsx';

export let LABEL_MODES = Object.freeze({
  DEFAULT: 0,
  SINGLE_IDENTITY: 1,
  TOPIC_SEGMENTS: 2
});

export let SELECT_MODES = Object.freeze({
  RANGE: 0,
  INDIVIDUAL: 1
});

// Displays results with basic pagination
@observer
class Groups extends React.Component {
  state = {
    page: 0,
    selected_start: -1,
    selected_end: -1,
    selected: new Set(),
    ignored: new Set(),
    positive_ex: new Set(),
    negative_ex: new Set()
  }

  constructor() {
    super();
    document.addEventListener('keypress', this._onKeyPress);
  }

  _isSelected = (i) => {
    let select_mode = this._settingsContext.get('select_mode');
    return (select_mode == SELECT_MODES.RANGE &&
            (this.state.selected_start == i ||
             (this.state.selected_start <= i && i <= this.state.selected_end))) ||
           (select_mode == SELECT_MODES.INDIVIDUAL && this.state.selected.has(i));
  }

  _getColorClass = (i) => {
    if (this.state.ignored.has(i)) {
      return 'ignored ';
    } else if (this._isSelected(i)) {
      return 'selected ';
    } else if (this.state.positive_ex.has(i)){
      return 'positive ';
    } else if (this.state.negative_ex.has(i)){
      return 'negative ';
    }
    return '';
  }

  _onKeyPress = (e) => {
    if (keyboardManager.locked()) {
      return;
    }

    let chr = String.fromCharCode(e.which);
    if (chr == 'a') {
      if (this.state.selected_start == -1) {
        return;
      }

      let green = this.state.positive_ex;
      let labeled = [];

      let select_mode = this._settingsContext.get('select_mode');
      if (select_mode == SELECT_MODES.RANGE) {
        let end = this.state.selected_end == -1 ? this.state.selected_start : this.state.selected_end;
        for (let i = this.state.selected_start; i <= end; i++) {
          if (this.state.ignored.has(i)) {
            continue;
          }

          labeled.push(this._dataContext.groups[i]);
          green.add(i);
        }
      } else if (select_mode == SELECT_MODES.INDIVDIUAL) {
        for (let i of this.state.selected) {
          labeled.push(this._dataContext.groups[i]);
          green.add(i);
        }
      }

      // TODO(wcrichto): make saving state + errors more apparent to user (without alert boxes)
      document.body.style.cursor = 'wait';
      axios
        .post('/api/labeled', {groups: labeled, label_mode: this._settingsContext.get('label_mode')})
        .then(((response) => {
          if (!response.data.success) {
            console.error(response.data.error);
            alert(response.data.error);
          } else {
            console.log('Done!');
            this.setState({
              positive_ex: green,
              selected_start: -1,
              selected_end: -1,
              selected: new Set()
            });
          }
        }).bind(this), (error) => {
          console.error(error);
          alert(error);
        })
        .finally(() => {
          document.body.style.cursor = 'auto';
        });
    }
  }

  _onSelect = (e) => {
    let select_mode = this._settingsContext.get('select_mode');
    if (select_mode == SELECT_MODES.RANGE) {
      if (this.state.selected_start == -1){
        this.setState({
          selected_start: e
        });
      } else if (e == this.state.selected_start) {
        this.setState({
          selected_start: -1,
          selected_end: -1
        });
      } else {
        if (e < this.state.selected_start) {
          if (this.state.selected_end == -1) {
            this.setState({
              selected_end: this.state.selected_start
            });
          }
          this.setState({
            selected_start: e
          });
        } else {
          this.setState({
            selected_end: e
          });
        }
      }
    } else if (select_mode == SELECT_MODES.INDIVIDUAL) {
      if (this.state.selected.has(e)) {
        this.state.selected.delete(e);
      } else {
        this.state.selected.add(e);
      }

      // Nested collection update, have to force re-render
      this.forceUpdate();
    }

    if (this._python) {
      this._python.update({selected: Array.from(this.state.selected)});
    }
  }

  _onIgnore = (e) => {
    if (this.state.ignored.has(e)) {
      this.state.ignored.delete(e);
    } else {
      this.state.ignored.add(e);
    }
    this.forceUpdate();
  }

  _numPages = () => {
    return Math.floor((this._dataContext.groups.length - 1)/ this._settingsContext.get('results_per_page'));
  }

  _nextPage = (e) => {
    e.preventDefault();
    this.setState({page: Math.min(this.state.page + 1, this._numPages())});
  }

  _prevPage = (e) => {
    e.preventDefault();
    this.setState({page: Math.max(this.state.page - 1, 0)});
  }

  componentDidMount() {
    this._lastResult = this._dataContext;
  }

  componentDidUpdate() {
    if (this._dataContext != this._lastResult) {
      this._lastResult = this._dataContext;
      this.setState({
        page: 0,
        positive_ex: new Set(),
        negative_ex: new Set(),
        ignored: new Set(),
        selected_start: -1,
        selected_end: -1
      });
    }
  }

  render () {
    return (
      <Consumer contexts={[SettingsContext, DataContext, PythonContext]}>{(settingsContext, dataContext, python) => {
          this._dataContext = dataContext;
          this._python = python;
          this._settingsContext = settingsContext;
          console.log(settingsContext);
          return <div className='groups'>
            <div>
              {_.range(settingsContext.get('results_per_page') * this.state.page,
                       Math.min(settingsContext.get('results_per_page') * (this.state.page + 1),
                                this._dataContext.groups.length))
                .map((i) => <Group key={i} group={this._dataContext.groups[i]} group_id={i}
                                       onSelect={this._onSelect} onIgnore={this._onIgnore}
                                       colorClass={this._getColorClass(i)} />)}
              <div className='clearfix' />
            </div>
            <div className='page-buttons'>
              <Rb.ButtonGroup>
                <Rb.Button onClick={this._prevPage}>&larr;</Rb.Button>
                <Rb.Button onClick={this._nextPage}>&rarr;</Rb.Button>
                <span key={this.state.page}>
                  <Rb.FormControl type="text" defaultValue={this.state.page + 1} onKeyPress={(e) => {
                      if (e.key === 'Enter') { this.setState({
                        page: Math.min(Math.max(parseInt(e.target.value)-1, 0), this._numPages())
                      }); }
                  }} />
                </span>
                <span className='page-count'>/ {this._numPages() + 1}</span>
              </Rb.ButtonGroup>
            </div>
          </div>;
      }}</Consumer>
    );
  }
}

@observer
class Group extends React.Component {
  state = {
    expand: false
  }

  _onKeyPress = (e) => {
    if (keyboardManager.locked()) {
      return;
    }

    let chr = String.fromCharCode(e.which);
    if (chr == 'f') {
      this.setState({expand: !this.state.expand});
    } else if (chr == 's') {
      this.props.onSelect(this.props.group_id);
    } else if (chr == 'x') {
      this.props.onIgnore(this.props.group_id);
    }
  }

  _onMouseOver = () => {
    document.addEventListener('keypress', this._onKeyPress);
  }

  _onMouseOut = () => {
    document.removeEventListener('keypress', this._onKeyPress);
  }

  componentWillUnmount() {
    document.removeEventListener('keypress', this._onKeyPress);
  }

  componentWillReceiveProps(props) {
    if (this.props.group != props.group) {
      this.setState({expand: false});
    }
  }

  render () {
    let group = this.props.group;
    return (
      <SettingsContext.Consumer>{settingsContext =>
        <div className={'group ' + this.props.colorClass} onMouseOver={this._onMouseOver}
             onMouseOut={this._onMouseOut}>
          {this.props.colorClass != '' ? <div className={'select-overlay ' + this.props.colorClass} /> : null}
          {settingsContext.get('timeline_view') && group.type == 'contiguous'
           ? <Timeline group={group} expand={this.state.expand}  />
           : <div className={group.type}>
             {group.label && group.label !== ''
              ? <div className='group-label'>{group.label}</div>
              : <span />}
             <div className='group-elements'>
               {group.elements.map((clip, i) =>
                 <div key={i} className='element'>
                   <Clip clip={clip} showMeta={true} expand={this.state.expand} />
                 </div>)}
               <div className='clearfix' />
             </div>
           </div>}
        </div>
      }</SettingsContext.Consumer>
    );
  }
}

@observer
export class GroupsContainer extends React.Component {
  state = {
    keyboardDisabled: false
  }

  _timer = null

  _onClick = () => {
    let disabled = !this.state.keyboardDisabled;

    // wcrichto 5-25-18: in order to disable the Jupyter keyboard manager, we have to call disable in an infinite
    // loop. This is because the ipywidgets framework uses KeyboardManager.register_events on the widget container
    // which can cause unpredictable behavior in unexpectedly reactivating the keyboard manager (hard to consistently
    // maintain focus on the widget area), so the simplest hacky solution is just to forcibly disable the manager
    // by overriding all other changes to its settings.
    if (disabled) {
      this._timer = setInterval(() => {this.props.jupyter.keyboard_manager.disable();}, 100);
    } else {
      clearInterval(this._timer);
      this.props.jupyter.keyboard_manager.enable();
    }
    this.setState({keyboardDisabled: disabled});
  }

  componentWillUnmount() {
    if (this._timer != null) {
      clearInterval(this._timer);
    }

    if (this.props.jupyter !== null) {
      this.props.jupyter.keyboard_manager.enable();
    }
  }

  render() {
    let hasJupyter = this.props.jupyter !== null;
    let JupyterButton = () => <button onClick={this._onClick}>{
        this.state.keyboardDisabled ? 'Enable Jupyter keyboard' : 'Disable Jupyter keyboard'
    }</button>;
    return (
      <div className='groups-container'>
        {hasJupyter ? <JupyterButton /> : null}
        <Groups {...this.props} />
        {hasJupyter ? <JupyterButton /> : null}
      </div>
    )
  }
}

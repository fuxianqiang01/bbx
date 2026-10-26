(function () {
  'use strict';
  var names = [
    '__bbxFlow', '__bbxFlow2', '__bbxFlowLog', '__bbxFlowMap',
    '__bbxFlowMapNewOrders', '__bbxFlowMapAssign', '__bbxFlowMapAutoOn',
    '__bbxMapSetLive', '__bbxDialDiag'
  ];
  var api = {};
  names.forEach(function (name) { api[name] = typeof window[name]; });
  return JSON.stringify({
    href: location.href,
    title: document.title,
    readyState: document.readyState,
    hasCallBox: !!document.querySelector('#bbx-aq-callbox'),
    hasFlowPanel: !!document.querySelector('#bbx-aq-flow'),
    hasOrderPanel: !!document.querySelector('#bbx-aq-flow2'),
    api: api
  }, null, 2);
})()

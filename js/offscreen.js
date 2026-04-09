let peer = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'START_AMBIENT_BROADCAST' && msg.streamId) {
    // Use the streamId from tabCapture to get the media stream
    navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: msg.streamId
        }
      },
      video: false
    }).then((stream) => {
      if (peer) { peer.destroy(); peer = null; }

      peer = new Peer('doctorai-laptop-host', { debug: 0 });

      peer.on('open', () => {
        chrome.runtime.sendMessage({ action: 'AMBIENT_STATUS', status: 'broadcasting' });
      });

      peer.on('call', (call) => {
        call.answer(stream);
        chrome.runtime.sendMessage({ action: 'AMBIENT_STATUS', status: 'connected' });
      });

      peer.on('error', (e) => {
        chrome.runtime.sendMessage({ action: 'AMBIENT_STATUS', status: 'error', message: e.type });
      });

    }).catch((err) => {
      chrome.runtime.sendMessage({ action: 'AMBIENT_STATUS', status: 'mic_denied', message: err.message });
    });
  }

  if (msg.action === 'STOP_AMBIENT_BROADCAST') {
    if (peer) { peer.destroy(); peer = null; }
    chrome.runtime.sendMessage({ action: 'AMBIENT_STATUS', status: 'stopped' });
  }
});

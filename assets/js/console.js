/* eslint no-console: ["error", { allow: ["log"] }] */

import { Socket } from 'phoenix';
import { Terminal } from 'xterm';

let socket = new Socket('/socket', { params: { token: window.userToken } });

const xtermjsTheme = {
  foreground: '#FFFAF4',
  background: '#0E1019',
  selectionBackground: '#48B9C7',
  black: '#232323',
  brightBlack: '#444444',
  red: '#D82036',
  brightRed: '#FF2740',
  green: '#8CE10B',
  brightGreen: '#ABE15B',
  yellow: '#FFB900',
  brightYellow: '#FFD242',
  blue: '#007AD8',
  brightBlue: '#0092FF',
  magenta: '#6D43A6',
  brightMagenta: '#9A5FEB',
  cyan: '#00D8EB',
  brightCyan: '#67FFF0',
  white: '#FFFFFF',
  brightWhite: '#FFFFFF'
};

// Try loading scrollback from local storage. If not, use 1000 (which is xterm.js default)
let scrollback = 1000;
try {
  let stored_scrollback = parseInt(localStorage.getItem('scrollback'));
  if (Number.isSafeInteger(stored_scrollback)) {
    scrollback = stored_scrollback;
  }
} catch (e) {}

var term = new Terminal({
  rows: 28,
  cols: 120,
  cursorBlink: true,
  cursorStyle: 'bar',
  macOptionIsMeta: true,
  fontFamily: 'Ubuntu Mono, courier-new, courier, monospace',
  fontSize: 15,
  theme: xtermjsTheme,
  scrollback: scrollback,
})

var device_id = document.getElementById('device_id').value;

socket.connect();

term.open(document.getElementById('terminal'));
term.focus();

let chatBody = document.getElementById('chat-body');
let chatMessage = document.getElementById('chat-message');

let channel = socket.channel(`user:console:${device_id}`, {});

channel
  .join()
  .receive('ok', () => {
    console.log('JOINED');
    // This will be the same for everyone, the first time it should be used
    // and there after it will be ignored as a noop by erlang
    channel.push('window_size', { height: term.rows, width: term.cols });
    channel.push('message', { event: "loaded the console" });
  })
  .receive('error', () => {
    console.log('ERROR');
  });

// Stream all events straight to the device
term.onData(data => {
  channel.push('dn', { data })
});

// Write data from device to console
channel.on('up', payload => {
  term.write(payload.data)
});

channel.on("message", payload => {
  if (payload.text) {
    chatBody.append(`${payload.username}: ${payload.text}\n`);
  } else if (payload.event) {
    chatBody.append(`${payload.username} ${payload.event}\n`);
  }
  chatBody.scrollTop = chatBody.scrollHeight
});

chatBody.addEventListener("click", (e) => {
  chatMessage.focus();
});
chatMessage.addEventListener("keypress", (e) => {
  if (e.key == "Enter") {
    channel.push("message", { text: chatMessage.value });
    chatMessage.value = "";
  }
});

let downloadingFileBuffer = [];

channel.on("file-data/start", payload => {
  downloadingFileBuffer = [];
});

channel.on("file-data", payload => {
  const data = atob(payload.data);

  const buffer = new Uint8Array(data.length);

  for (var i = 0; i < data.length; i++){
    buffer[i] = data.charCodeAt(i);
  }

  downloadingFileBuffer.push(buffer);
});

channel.on("file-data/stop", payload => {
  let length = 0;

  for (let i in downloadingFileBuffer) {
    let buffer = downloadingFileBuffer[i];
    length += buffer.length;
  }

  const mainBuffer = new Uint8Array(length);

  let offset = 0;

  for (let i in downloadingFileBuffer) {
    let buffer = downloadingFileBuffer[i];
    mainBuffer.set(buffer, offset);
    offset += buffer.length;
  }

  const file = new Blob([mainBuffer]);

  const link = document.createElement('a');
  const url = URL.createObjectURL(file)

  link.href = url;
  link.download = payload.filename;
  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
});

// Set new size on device when window changes
window.addEventListener('resize', () => {
  term.scrollToBottom();
});

channel.onClose(() => {
  console.log('CLOSED');
  term.blur();
  term.setOption('cursorBlink', false);
  term.write('DISCONNECTED');
});

/****************************************************************************
 * Initial setup
 ****************************************************************************/

var configuration = {'iceServers': [{'url': 'stun:stun.l.google.com:19302'}]};
// {"url":"stun:stun.services.mozilla.com"}

//var serverIP = '140.114.77.126';
//var server = 'https://140.114.77.126:8080/';

var server = 'https://127.0.0.1:8080/';
var serverIP = '127.0.0.1';

    roomURL = document.getElementById('url'),
    video = document.getElementById('video'),
    cameraVideo = document.getElementById('camera'),
    remoteVideo = document.getElementById("remoteVideo"),
    photo = document.getElementById('photo'),
    photoContext = photo.getContext('2d'),
    trail = document.getElementById('trail'),

    snapBtn = document.getElementById('snap'),
    sendBtn = document.getElementById('send'),
    snapAndSendBtn = document.getElementById('snapAndSend'),
    startButton = document.getElementById("startButton"),
    callButton = document.getElementById("callButton"),
    hangupButton = document.getElementById("hangupButton"),
    playBtn = document.getElementById('play'),
    pauseBtn = document.getElementById('pause'),

    localStream = null,
    // Default values for width and height of the photoContext.
    // Maybe redefined later based on user's webcam cameraVideo stream.
    photoContextW = 300, photoContextH = 150;
    video.controls = true;

// Attach even handlers
cameraVideo.addEventListener('play', setCanvasDimensions);
snapBtn.addEventListener('click', snapPhoto);
sendBtn.addEventListener('click', sendPhoto);
snapAndSendBtn.addEventListener('click', snapAndSend);
startButton.onclick = start;
callButton.onclick = call;
hangupButton.onclick = hangup;
playBtn.onclick = videoPlay;
pauseBtn.onclick = videoPause;

startButton.disabled = false;
callButton.disabled = true;
hangupButton.disabled = true;
snapBtn.disabled = true;
sendBtn.disabled = true;
snapAndSendBtn.disabled = true;

// Create a random room if not already present in the URL.
var isInitiator;
var room = window.location.hash.substring(1);
if (!room) {
    room = window.location.hash = randomToken();
}


/****************************************************************************
 * Signaling server 
 ****************************************************************************/

// Connect to the signaling server
var socket = io.connect(server);

socket.on('ipaddr', function (ipaddr) {
    console.log('Server IP address is: ' + ipaddr);
    updateRoomURL(ipaddr);
});

socket.on('created', function (room, clientId) {
  console.log('Created room', room, '- my client ID is', clientId);
  isInitiator = true;
 // grabWebCamVideo();
});

socket.on('joined', function (room, clientId) {
  console.log('This peer has joined room', room, 'with client ID', clientId);
  isInitiator = false;
 // grabWebCamVideo();
});

socket.on('full', function (room) {
    alert('Room "' + room + '" is full. We will create a new room for you.');
    window.location.hash = '';
    window.location.reload();
});

socket.on('ready', function () {
    createPeerConnection(isInitiator, configuration, photo);
})

socket.on('log', function (array) {
  console.log.apply(console, array);
});

socket.on('message', function (message){
    console.log('Client received message:', message);
    signalingMessageCallback(message);
});
socket.on('set initiator',function(){
    console.log('Client set initiator');
    isInitiator = true;
});
if (location.hostname == serverIP) {
    socket.emit('ipaddr');
}

/**
 * Send message to signaling server
 */
function sendMessage(message){
    console.log('Client sending message: ', message);
    socket.emit('message', message);
}

/**
 * Updates URL on the page so that users can copy&paste it to their peers.
 */
function updateRoomURL(ipaddr) {
    var url;
    if (!ipaddr) {
        url = location.href
    } else {
        url = location.protocol + '//' + ipaddr + ':8080/#' + room
    }
    roomURL.innerHTML = url;
}


/**************************************************************************** 
 * User media (webcam) 
 ****************************************************************************/
function start() {
  trace("Requesting local stream");
  startButton.disabled = true;
  snapBtn.disabled = false;

  constraints = {
    "audio": true,
    "video": {
        "width": {
            "min": "300",
            "max": "640"
        },
        "height": {
            "min": "200",
            "max": "480"
        }
    }
}
  getUserMedia(constraints, getMediaSuccessCallback, getMediaErrorCallback);
}

// function grabWebCamVideo() {
//     console.log('Getting user media (cameraVideo) ...');
//     getUserMedia({cameraVideo: true}, getMediaSuccessCallback, getMediaErrorCallback);
// }

function getMediaSuccessCallback(stream) {
    callButton.disabled = false;
    var streamURL = window.URL.createObjectURL(stream);
    console.log('getUserMedia cameraVideo stream URL:', streamURL);
    localStream = stream; // stream available to console

    cameraVideo.src = streamURL;
    //video.src = '../video/src1.mp4';
    show(snapBtn);
}

function getMediaErrorCallback(error){
    console.log("getUserMedia error:", error);
}

/**************************************************************************** 
 * Setup Video
 ****************************************************************************/
 video.src = '../video/src1.mp4';
// var src = "https://www.youtube.com/watch?v=vlR84-WZhl4";
// getVideoSource(src);
// function getVideoSource(src){
//     var isYoutube = src && src.match(/(?:youtu|youtube)(?:\.com|\.be)\/([\w\W]+)/i);
//     var id = isYoutube[1].match(/watch\?v=|[\w\W]+/gi);
//     id = (id.length > 1) ? id.splice(1) : id;
//     id = id.toString();
//     var mp4url = "https://youtubeinmp4.com/redirect.php?video=";
//     video.src = mp4url + id;
// }

/**************************************************************************** 
 * WebRTC peer connection and data channel
 ****************************************************************************/

var peerConn;
var photoChannel;
var videoSyncChannel;

function call() {
  callButton.disabled = true;
  hangupButton.disabled = false;
  snapAndSendBtn.disabled = false;
  trace("Starting call");
     // Join a room
    socket.emit('create or join', room);

  if (localStream.getVideoTracks().length > 0) {
    trace('Using cameraVideo device: ' + localStream.getVideoTracks()[0].label);
  }
  if (localStream.getAudioTracks().length > 0) {
    trace('Using audio device: ' + localStream.getAudioTracks()[0].label);
  }
}

function signalingMessageCallback(message) {
    if (message.type === 'offer') {
        console.log('Got offer. Sending answer to peer.');
        peerConn.setRemoteDescription(new RTCSessionDescription(message), function(){}, logError);
        peerConn.createAnswer(onLocalSessionCreated, logError);

    } else if (message.type === 'answer') {
        console.log('Got answer.');
        peerConn.setRemoteDescription(new RTCSessionDescription(message), function(){}, logError);

    } else if (message.type === 'candidate') {
        peerConn.addIceCandidate(new RTCIceCandidate({candidate: message.candidate}));

    } else if (message === 'bye') {
        // TODO: cleanup RTC connection?
        console.log('Got bye.');
        peerConn.close();
        peerConn = null;
    }else if (message === 'recall'){
        console.log('Got recall.');
        createPeerConnection(isInitiator, configuration, photo);
    }
}

function createPeerConnection(isInitiator, config, channel) {
    console.log('Creating Peer connection as initiator?', isInitiator, 'config:', config);
    peerConn = new RTCPeerConnection(config);
    /********************************************/
        peerConn.addStream(localStream); 
        trace("Added localStream to PeerConnection");
    /********************************************/

    // send any ice candidates to the other peer
    peerConn.onicecandidate = function (event) {
        console.log('onIceCandidate event:', event);
        if (event.candidate) {
            sendMessage({
                type: 'candidate',
                label: event.candidate.sdpMLineIndex,
                id: event.candidate.sdpMid,
                candidate: event.candidate.candidate
            });
        } else {
            console.log('End of candidates.');
        }
    };
    peerConn.onaddstream = function (event){
      remoteVideo.src = URL.createObjectURL(event.stream);
      trace("Received remote stream");
    }

    if (isInitiator) {
        /**************************************
        Create Data Channel
        ***************************************/
        console.log('Creating Data Channel');
        photoChannel = peerConn.createDataChannel("photos");
        onPhotoChannelCreated(photoChannel);
        videoSyncChannel = peerConn.createDataChannel("videoSync");
        onVideoSyncChannelCreated(videoSyncChannel);

        console.log('Creating an offer');
        peerConn.createOffer(onLocalSessionCreated, logError);
    } else {
        peerConn.ondatachannel = function (event) {
            console.log('ondatachannel:', event);
            if(event.channel.label === 'photos'){ 
                photoChannel = event.channel;
                onPhotoChannelCreated(photoChannel);
            }else if(event.channel.label === 'videoSync'){ 
                videoSyncChannel = event.channel;
                onVideoSyncChannelCreated(videoSyncChannel);
            }
           
        };
    }
}

function onLocalSessionCreated(desc) {
    console.log('local session created:', desc);
    peerConn.setLocalDescription(desc, function () {
        console.log('sending local desc:', peerConn.localDescription);
        sendMessage(peerConn.localDescription);
    }, logError);
}

function onVideoSyncChannelCreated(channel){
    console.log('onVideoSyncChannelCreated:', channel);

    channel.onopen = function () {
        console.log('videoSync channel opened!!!');

        video.addEventListener('play',function(){
            channel.send('play');
        });
        video.addEventListener('pause',function(){
            channel.send('pause');
        });
        video.addEventListener('seeked',function(){
            channel.send('time:'+video.currentTime);
        });
    }

    channel.onmessage = function (event){
        console.log('Got message from videoSyncChannel '+event);
        syncVideo(event.data);
    }
}
/********************************************
Debug message
********************************************/
        video.addEventListener('play',function(){
            console.log('play');
        });
        video.addEventListener('pause',function(){
            console.log('pause');
        });
        video.addEventListener('seeked',function(){
            console.log('time:'+video.currentTime);
        });

function onPhotoChannelCreated(channel) {
    console.log('onPhotoChannelCreated:', channel);

    channel.onopen = function () {
        console.log('Photo channel opened!!!');
    };

    channel.onmessage = (webrtcDetectedBrowser == 'firefox') ? 
        receiveDataFirefoxFactory() :
        receiveDataChromeFactory();
}

function hangup() {
      hangupButton.disabled = true;
      callButton.disabled = false;
      trace("Ending call");
      socket.emit('leave',room);
      peerConn.close();
      peerConn = null;
}

function receiveDataChromeFactory() {
    var buf, count;

    return function onmessage(event) {
        if (typeof event.data === 'string') {
            buf = window.buf = new Uint8ClampedArray(parseInt(event.data));
            count = 0;
            console.log('Expecting a total of ' + buf.byteLength + ' bytes');
            return;
        }

        var data = new Uint8ClampedArray(event.data);
        buf.set(data, count);

        count += data.byteLength;
        console.log('count: ' + count);

        if (count === buf.byteLength) {
            // we're done: all data chunks have been received
            console.log('Done. Rendering photo.');
            renderPhoto(buf);
        }
    }
}

function receiveDataFirefoxFactory() {
    var count, total, parts;

    return function onmessage(event) {
        if (typeof event.data === 'string') {
            total = parseInt(event.data);
            parts = [];
            count = 0;
            console.log('Expecting a total of ' + total + ' bytes');
            return;
        }

        parts.push(event.data);
        count += event.data.size;
        console.log('Got ' + event.data.size + ' byte(s), ' + (total - count) + ' to go.');

        if (count == total) {
            console.log('Assembling payload')
            var buf = new Uint8ClampedArray(total);
            var compose = function(i, pos) {
                var reader = new FileReader();
                reader.onload = function() { 
                    buf.set(new Uint8ClampedArray(this.result), pos);
                    if (i + 1 == parts.length) {
                        console.log('Done. Rendering photo.');
                        renderPhoto(buf);
                    } else {
                        compose(i + 1, pos + this.result.byteLength);
                    }
                };
                reader.readAsArrayBuffer(parts[i]);
            }
            compose(0, 0);
        }
    }
}
/**************************************************************************** 
 * Video Sync functions, mostly UI-related
 ****************************************************************************/

function syncVideo(message){
    console.log("receive message "+message);
    if(message === 'play'){
        video.play();
    }else if(message === 'pause'){
        video.pause();
    }else{
        time = parseFloat(message.split(':')[1]);
        console.log('set video to time '+time);
        if(Math.abs(video.currentTime - time)>0.5){    
            video.currentTime = time;
        }
        
    }
    
}
function videoPlay(){
    video.play();
    videoSyncChannel.send('play');
}
function videoPause(){
    video.pause();
    videoSyncChannel.send('pause');
}
/**************************************************************************** 
 * Aux functions, mostly UI-related
 ****************************************************************************/

function snapPhoto() {
    photoContext.drawImage(cameraVideo, 0, 0, photoContextW, photoContextH);
    show(photo, sendBtn);
}

function sendPhoto() {
    // Split data channel message in chunks of this byte length.
    var CHUNK_LEN = 64000;

    var img = photoContext.getImageData(0, 0, photoContextW, photoContextH),
        len = img.data.byteLength,
        n = len / CHUNK_LEN | 0;

    console.log('Sending a total of ' + len + ' byte(s)');
    photoChannel.send(len);

    // split the photo and send in chunks of about 64KB
    for (var i = 0; i < n; i++) {
        var start = i * CHUNK_LEN,
            end = (i+1) * CHUNK_LEN;
        console.log(start + ' - ' + (end-1));
        photoChannel.send(img.data.subarray(start, end));
    }

    // send the reminder, if any
    if (len % CHUNK_LEN) {
        console.log('last ' + len % CHUNK_LEN + ' byte(s)');
        photoChannel.send(img.data.subarray(n * CHUNK_LEN));
    }
}

function snapAndSend() {
    snapPhoto();
    sendPhoto();
}

function renderPhoto(data) {
    var canvas = document.createElement('canvas');
    canvas.classList.add('photo');
    trail.insertBefore(canvas, trail.firstChild);

    var context = canvas.getContext('2d');
    var img = context.createImageData(photoContextW, photoContextH);
    img.data.set(data);
    context.putImageData(img, 0, 0);
}

function setCanvasDimensions() {
    if (cameraVideo.cameraVideoWidth == 0) {
        setTimeout(setCanvasDimensions, 200);
        return;
    }
    
    console.log('cameraVideo width:', cameraVideo.videoWidth, 'height:', cameraVideo.videoHeight)

    photoContextW = cameraVideo.cameraVideoWidth / 2;
    photoContextH = cameraVideo.cameraVideoHeight / 2;
    //photo.style.width = photoContextW + 'px';
    //photo.style.height = photoContextH + 'px';
    // TODO: figure out right dimensions
    photoContextW = 300; //300;
    photoContextH = 150; //150;
}

function show() {
    Array.prototype.forEach.call(arguments, function(elem){
        elem.style.display = null;
    });
}

function hide() {
    Array.prototype.forEach.call(arguments, function(elem){
        elem.style.display = 'none';
    });
}

function randomToken() {
    return Math.floor((1 + Math.random()) * 1e16).toString(16).substring(1);
}

function logError(err) {
    console.log(err.toString(), err);
}
function trace(text) {
  console.log((performance.now() / 1000).toFixed(3) + ": " + text);
}

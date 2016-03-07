var Gpio = require('pigpio').Gpio,
  url = require("url"),
  RaspiCam = require("raspicam"),
  fs = require('fs'),
  path = require('path'),
  tilt = new Gpio(23, {mode: Gpio.OUTPUT}),
  pan  = new Gpio(18, {mode: Gpio.OUTPUT}),
  pulseWidth = 1000,
  increment = 50,
  index = fs.readFileSync(__dirname + '/www/pan-tilt.htm'),
  image = null,
  http = require('http'),
  panPos =  1300, panMin = 750,  panMax = 2500,
  tiltPos = 1700, tiltMin = 750, tiltMax = 2500,
  captureWidth = 320,
  captureHeight = 320,
  //Canvas = require('canvas'), 
  //Image = Canvas.Image, 
  //canvas = new Canvas(captureWidth , captureHeight), 
  //ctx = canvas.getContext('2d'), 
  //img = new Image, 
  //face_detect = require('face-detect'), 
  is_processing_detection = false
;

var sockets = {};


var camera = new RaspiCam({ 
  mode:'timelapse', 
  output:'./temp/shot.jpg', 
  w:captureWidth , 
  h:captureHeight, 
  e:'jpg', 
  t:"999999999", 
  tl:"250", 
  v: false
});

var crappyLibChecker = function() {
  var crappyLibPath = './node_modules/raspicam/lib/raspicam.js';
  var libContent = '' + fs.readFileSync( crappyLibPath, 'utf-8' );
  if(libContent.toString().match(/rpisentry/)) {
    console.log('Crappy console spamming lib already patched!\n');
    return;
  } else {
    console.log('no match for');
    console.log( libContent.match(/rpisentry/) );
  }
  libContent = '/* rpisentry patched : console.log disabled */\n' + libContent.replace(/console.log/g, '/' + '/console.log');
  fs.writeFile(crappyLibPath, libContent, 'utf8', function(err) {
    if(err) return console.log(err);
    throw('Crappy console spamming lib patched\n');
  });
}

crappyLibChecker();


camera.start( );

camera.on("read", function(err, timestamp, filename){ 
    var data = null;
    if(filename.substr(-1)=='~') return;
    //io.emit('shot', {url: filename, b64: btoa(fs.readFileSync(filename))});
    data = fs.readFileSync('./temp/' + filename);
    io.emit('shot', {image: true, buffer: data});
    /*
    return;
    if(!is_processing_detection) {
      is_processing_detection = true;
      img.src = data;
      ctx.drawImage(img, 0, 0, captureWidth, captureHeight);
      setTimeout(function() {
        result = face_detect.detect_objects({ "canvas" : canvas, "interval" : 5,  "min_neighbors" : 1 });
        if(result.length) console.log(result);
        is_processing_detection = false;
      },100);
    }*/
    //io.emit('shot', {image: true, buffer: fs.readFileSync(filename)});
});

var app = http.createServer(function(req, res) {
    var requrl = url.parse(req.url).pathname;
    if(requrl=='/shot.jpg') {
      res.writeHead(200, {"Content-Type": "image/jpg"});
      res.write(fs.readFileSync(__dirname + '/temp/shot.jpg'));
      res.end();
    } else {

      if(requrl == '/') {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end(index);
	return;
      }
      
      fs.readFile(__dirname + '/www' + req.url, function (err,data) {
	if (err) {
	  res.writeHead(404);
	  res.end(JSON.stringify(err));
	  return;
	}
	res.writeHead(200);
	res.end(data);
      });
      
      //res.writeHead(200, {'Content-Type': 'text/html'});
      //res.end(index);
    }

});

io = require('socket.io').listen(app);	//web socket server

// Send current status
function sendPos() {
    io.emit('servos', {
      tilt: {
        pos: tiltPos,
        min: tiltMin,
        max: tiltMax
      },
      pan: {
        pos: panPos,
        min: panMin,
        max: panMax
      },
      eye: {
	width: captureWidth,
	height: captureHeight
      }
    });
}

// Send current position every 10 secs
setInterval(sendPos, 10000);

// set initial position
tilt.servoWrite( panPos );
pan.servoWrite( tiltPos );

app.listen(80); //start the webserver on port 80 (since this app needs to be root for gpio)

io.sockets.on('connection', function (socket) { //gets called whenever a client connects

  sockets[socket.id] = socket;
  console.log("Total clients connected : ", Object.keys(sockets).length);
  sendPos();
    
  socket.on('servos', function (data) { 
    // move servo
    panPos = 0- -data.pan;
    if(panPos < panMin) panPos = panMin;
    if(panPos > panMax) panPos = panMax;
    pan.servoWrite( tiltPos );
    // move servo
    tiltPos = 0- -data.tilt;
    if(tiltPos < tiltMin) tiltPos = tiltMin;
    if(tiltPos > tiltMax) tiltPos = tiltMax;
    tilt.servoWrite( panPos );
    sendPos();
  });
  
  socket.on('camsetting', function(data) {
    console.log('receiving', data);
    captureWidth = 0- -data.w;
    captureHeight = 0- -data.h;
    camera.set("w", captureWidth);
    camera.set("h", captureHeight);
    //canvas = new Canvas(captureWidth , captureHeight);
  });

  socket.on('disconnect', function() {
    delete sockets[socket.id];
  });

});

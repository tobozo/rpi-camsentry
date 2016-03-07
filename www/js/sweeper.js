

(function() {
    let socket = io()   
      , wsCon = true
      , wsOpen = false
      , inputTilt = document.querySelector('input[name="Tilt"]')
      , inputPan = document.querySelector('input[name="Pan"]')
      , cameraRatios = document.querySelectorAll('input[name="camsettings"]')
      , joyBounds = {
	  width:  (inputPan.max  - inputPan.min),
	  height: (inputTilt.max - inputTilt.min)
        }
      , joyDiv = document.createElement('div')
      , mouseX, mouseY, lastmouseX, lastmouseY
      , queue = null
      , processing = null
      , isWebkit = 'WebkitAppearance' in document.documentElement.style
      , boxShadowColor = isWebkit ? 'rgba(0,0,0,0.3)' : 'black'
      , canvas = document.querySelector('#canvas-source')
      , ctx = (canvas!==null) ? canvas.getContext('2d') : null
      , imgLoading = false
      , canvasHolder = document.querySelector('#motion')
      , indicator = document.createElement('img')
      , onlineIcon = '/img/icons/online.png'
      , offlineIcon = '/img/icons/offline.png'
      , sentryTimer = null
      , sentryDirection = 1
      , sentryLameness = 5000
      , sentryFreq = 500
      , sentryLastTime = Date.now()
      , progress = document.querySelector('#lameness')
    ;
    
    progress.setAttribute('max', 10);
    progress.setAttribute('value', 0);
    
    indicator.id = 'indicator';
    indicator.src = offlineIcon;
    document.querySelector('#controls').appendChild(indicator);
    canvas.style.display = 'block';
    
    let socketOpen = function() {

      let fileReader = new FileReader();
      
      socket.on('welcome', function(data) {
        wsOpen = true;
        document.querySelector('#indicator').src = onlineIcon
        socket.emit('hello', {raspberry:'pi'});
      });
      
      socket.on('shot', function(data) {
        if(imgLoading) return;
        imgLoading = true;
        let blob = new Blob([data.buffer], {type: "image/jpg"}),
	    facePoll = null;
        // onload needed since Google Chrome doesn't support addEventListener for FileReader
        fileReader.onload = function (evt) {
          let img = new Image();
          img.onload = function() {
            let bgImage = 'url("'+evt.target.result+'")';
            if(canvas) {
              canvas.width = img.width;
              canvas.height = img.height;
              ctx.drawImage( img, 0, 0 );
	      
	      facePoll = ccv.detect_objects({
		"canvas" : ccv.grayscale(ccv.pre(img)),
		"cascade" : cascade,
		"interval" : 5,
		"min_neighbors" : 1 
	      });
              if(facePoll.length) {
		stopSentry();
                sentryLastTime = Date.now();
	        highlightFaces(facePoll);
		setProgress(0);
	      } else {
		if( getProgress() >= progress.getAttribute('max') ) {
		   if( sentryTimer === null ) {
		     //startSentry();
		   } else {
                     //stopSentry();
		     //progress.setAttribute('value', 1- -progress.getAttribute('value'));
		   }
		} else {
                   sentryLastTime = Date.now();
		   stopSentry();
		   setProgress(1- -getProgress());
		}
	      }

	      imgLoading = false;
            }
          }
          img.src = evt.target.result;
        };
        fileReader.readAsDataURL(blob);
      });
      
      socket.on('servos', function(data) {
        inputPan.max = data.pan.max;
        inputPan.min = data.pan.min;
        inputPan.value = data.pan.pos;
        
        inputTilt.max = data.tilt.max;
        inputTilt.min = data.tilt.min;
        inputTilt.value = data.tilt.pos;
        
        if(!wsOpen) {        
          wsOpen = true;
          initMousePad();
        }
        updateUi();
        
        if( data.eye.height +'px' !== canvasHolder.style.width
          || data.eye.width +'px' !== canvasHolder.style.height ) {
          canvasHolder.style.width = data.eye.width +'px';
          canvasHolder.style.height = data.eye.height +'px';
          //document.querySelector('input[value="'+ data.eye.width + 'x' + data.eye.height +'"]').click();
        }
        document.querySelector('#indicator').src = onlineIcon
      });
      socket.on('error', console.error.bind(console));
      socket.on('message', function(data) {
        //console.log('ws message', data);
        wsOpen = true;
        document.querySelector('#indicator').src = onlineIcon
      }); 
      
    }
    
    let updateUi = function() {
    
      joyDiv.setAttribute('data-pan', inputPan.value);
      joyDiv.setAttribute('data-tilt', inputTilt.value); 
      joyDiv.style.boxShadow = (inputPan.value/10 - inputPan.min/10)+'px '
        + (inputTilt.value/10 - inputTilt.min/10)+'px 1px 1px '+boxShadowColor+' inset, '
        + (inputPan.value/10 - inputPan.min/10 -joyBounds.width) + 'px ' + (inputTilt.value/10 - inputTilt.min/10 -joyBounds.height) + 'px 1px 1px '+boxShadowColor+' inset';
    }
    
    let submitChanges = function() {
        if(wsOpen) {
          socket.emit('servos', {pan:inputPan.value, tilt: inputTilt.value});
        }
        updateUi();
        processing = false;
        return;
    }

    let getMousePos = function(e){
        mouseX = e.clientX - offset(this).left;
        mouseY = e.clientY - offset(this).top;
    }

    let offset = function(elt) {
        let rect = elt.getBoundingClientRect(), bodyElt = document.body;
        return {
            top: rect.top + bodyElt .scrollTop,
            left: rect.left + bodyElt .scrollLeft
        }
    }

    let mouseDown = 0, elementID;
    document.body.onmousedown = function(e) { 
      elementID = (e.target || e.srcElement).id;
      ++mouseDown;
      stopSentry();
    }
    document.body.onmouseup = function() {
      elementID = null;
      --mouseDown;
      stopSentry();
    }

    let initMousePad = function() {
    
      joyBounds = {
        width:  (inputPan.max/10  - inputPan.min/10),
        height: (inputTilt.max/10 - inputTilt.min/10)
      }
      
      joyDiv.id = 'joystick';
      joyDiv.style.width  = joyBounds.width + 'px';
      joyDiv.style.height = joyBounds.height + 'px';
      joyDiv.style.backgroundSize = '100% 100%';
      
    }    

    let submitCamSettings = function() {
      if(wsOpen) {
	//console.log('sending', {w:this.value.split('x')[0], h: this.value.split('x')[1]});
	socket.emit('camsetting', {w:this.value.split('x')[0], h: this.value.split('x')[1]});
      }
    }
    
    let startSentry = function() {
      if( sentryTimer !== null ) {
	// already started, ignore
	console.log('ignoring timer request');
	return;
      }
      
      //sentryTimer = true;
      
      sentryTimer = setTimeout(function() {
	console.log('sentry will start in 5 sec');
	sentryTimer = setInterval(function() {
	  console.log('sentry start !');
	  nextSentryMove();
	}, sentryFreq);
      }, sentryLameness);
    }
    
    let stopSentry = function() {
	clearInterval( sentryTimer );
	clearTimeout( sentryTimer );
	console.log( 'sentry stop', sentryTimer );
	sentryTimer = false;
	setTimeout(function() {
	  sentryTimer = null;
	  console.log( 'sentry timer reset', sentryTimer );
	}, sentryLameness);
    };
    
    
    let nextSentryMove = function() {
       if(inputPan.value- -inputPan.step >= inputPan.max) {
	 sentryDirection = -1;
       }
       if(inputPan.value- inputPan.step <= inputPan.min) {
         sentryDirection = 1;//- sentryDirection;  
       }
       inputPan.value = inputPan.value- -(sentryDirection * inputPan.step);
       submitChanges();
    }
    
    let getProgress = function() {
      return document.querySelector('#lameness').getAttribute('value'); 
    }
    
    let setProgress = function(value) {
      document.querySelector('#lameness').setAttribute('value', value);
    }
    
    
    
    let highlightFaces = function(comp) {
      let centerX = 0;
      let centerY = 0;
      let absX = canvas.width/2;
      let absY = canvas.height/2;

      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(230,87,0,0.8)';
      /* draw detected area */
      for (var i = 0; i < comp.length; i++) {
	centerX = comp[i].x + comp[i].width * 0.5;
	centerY = comp[i].y + comp[i].height * 0.5;
	absX += centerX;
	absY += centerY;
	ctx.beginPath();
	ctx.arc(centerX, centerY, (comp[i].width + comp[i].height) * 0.25 * 1.2, 0, Math.PI * 2);
	ctx.stroke();
      }
      
      centerX = centerX / comp.length+1;
      centerY = centerY / comp.length+1;
      
      //if(comp.length === 1) {
	
      if( centerX > (canvas.width/2- -inputPan.step/2) ) {
	inputPan.value = inputPan.value -inputPan.step;
      }
      if( centerX < (canvas.width/2 -inputPan.step/2) ) {
	inputPan.value = inputPan.value- -inputPan.step;
      }
      if( centerY > (canvas.height/2- -inputPan.step/2) ) {
	inputTilt.value = inputTilt.value- -inputTilt.step;
      }
      if( centerY < (canvas.height/2 -inputPan.step/2) ) {
	inputTilt.value = inputTilt.value -inputTilt.step;
	}
	submitChanges();
      //}
	    
    }
    
    
    
    inputTilt.addEventListener('change', submitChanges);
    inputPan.addEventListener('change', submitChanges);
    for(let i=0;i<cameraRatios.length;i++) {
      cameraRatios[i].addEventListener('click', submitCamSettings);
    }
    
    
    joyDiv.addEventListener('mousemove', getMousePos);
    document.querySelector('#controls').appendChild(joyDiv);
    
    try {
        window.console.log("Setting up socket");
        //ws = new WebSocket("ws://109.228.139.253:8383/");
        socketOpen();
    } catch(exception) {
        window.console.warn('<p>Error'+exception);
        wsOpen = false;
        document.querySelector('#indicator').src = offlineIcon
    }
    
    
    initMousePad();
    setIntervals();
    
    function setIntervals() {
      
      // poll for intercepting mouse clicks and drags
      setInterval(function() {
        if(mouseDown && elementID===joyDiv.id) {
	  
          stopSentry();
	  
          if(mouseX!=lastmouseX || mouseY!=lastmouseY) {
            if(processing !== true) {
              queue = true;
            }
            joyDiv.style.boxShadow = (mouseX)+'px '
                + (mouseY)+'px 1px 1px '+boxShadowColor+' inset, '
                + (mouseX-joyBounds.width) + 'px ' + (mouseY-joyBounds.height) + 'px 1px 1px '+boxShadowColor+' inset';
          }
          lastmouseX = mouseX;
          lastmouseY = mouseY;
        }
      }, 150);

      
      // poll for sending websocket tilt/pan updates
      setInterval(function() {
        if(queue === true && processing !== true) {
          processing = true;
          queue = false;
          inputPan.value = (mouseX*10) - -inputPan.min;
          inputTilt.value = (mouseY*10) - -inputTilt.min;
          submitChanges();
        }
      }, 150);
     
    }
    
   
    
})();

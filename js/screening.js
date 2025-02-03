import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils
} from "mediapipe/tasks-vision-outer.js"

let params = new URLSearchParams(window.location.search);
let delegate = params.get('delegate');
let debugVideo = params.get('debugVideo');

let poseLandmarker = undefined
let runningMode = "IMAGE"
let enableWebcamButton
let webcamRunning = false


// Check if webcam access is supported.
const hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia

// Before we can use PoseLandmarker class we must wait for it to finish
// loading. Machine Learning models can be large and take a moment to
// get everything needed to run.
const createPoseLandmarker = async () => {
  const vision = await FilesetResolver.forVisionTasks("/mci-screening-web/wasm")

  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: '/mci-screening-web/mediapipe-models/pose_landmarker_full.task',
      delegate: delegate,
    },
    runningMode: runningMode,
    numPoses: 1
  });

  if (hasGetUserMedia()) {
    enableCam()
  }
}
createPoseLandmarker();

const wrapper = document.getElementById("wrapper")
const video = document.getElementById("webcam")
const canvasElement = document.getElementById("output_canvas")
const canvasCtx = canvasElement.getContext("2d")
const drawingUtils = new DrawingUtils(canvasCtx)

window.restartVideo = function() {
    if(debugVideo != ""){
        video.currentTime = 0;
        video.play();
    }
}

// Enable the live webcam view and start detection.
function enableCam() {
  if (!poseLandmarker) {
    console.log("Wait! poseLandmaker not loaded yet.")
    return
  }

  if (webcamRunning === true) {
    webcamRunning = false
  } else {
    webcamRunning = true
  }

  // getUsermedia parameters.
  const constraints = {
    video: true
  }

  video.addEventListener('loadedmetadata', function() {
    var $this = this;
    const canvasWidth = canvasElement.offsetWidth;
    const canvasHeight = canvasElement.offsetHeight;
    canvasElement.width = canvasWidth;
    canvasElement.height = canvasHeight;

    const canvasAspectRatio = canvasWidth / canvasHeight;
  });

  video.addEventListener('play', function() {
    var $this = this;
    (function loop() {
      if (!$this.paused && !$this.ended) {
        const canvasWidth = canvasElement.width;
        const canvasHeight = canvasElement.height;

        const videoWidth = $this.videoWidth;
        const videoHeight = $this.videoHeight;

        const videoAspectRatio = videoWidth / videoHeight;
        const canvasAspectRatio = canvasWidth / canvasHeight;

        let drawWidth;
        let drawHeight;

        // If the video's aspect ratio is less than the canvas's aspect ratio
        // then the video's width will be equal to the canvas's width
        if (videoAspectRatio < canvasAspectRatio) {
          drawWidth = canvasWidth;
          drawHeight = videoHeight * (drawWidth / videoWidth);
        } else {
          // If the video's aspect ratio is greater than the canvas's aspect ratio
          // then the video's height will be equal to the canvas's height
          drawHeight = canvasHeight;
          drawWidth = videoWidth * (drawHeight / videoHeight);
        }

        if(debugVideo.startsWith("3")){
            // Flip the context horizontally
            canvasCtx.save();
            canvasCtx.scale(-1, 1);
            canvasCtx.translate(-canvasWidth, 0);
        }

        // Draw the image centered and covering the whole canvas
        canvasCtx.drawImage($this, canvasWidth * 0.5 - drawWidth * 0.5, canvasHeight * 0.5 - drawHeight * 0.5, drawWidth, drawHeight);

        if(debugVideo.startsWith("3")){
            canvasCtx.restore();
        }

        setTimeout(loop, 1000 / 30); // drawing at 30fps
      }
    })();

    window.requestAnimationFrame(() => {
      canvasElement.classList.add("visible");
    })
    predict();
  }, 0);

  // Fetch the video file
  if(debugVideo && debugVideo != ""){
    loadVideo();
  }else{
    navigator.mediaDevices.getUserMedia(constraints)
          .then((stream) => {
            video.srcObject = stream;
            video.play();
          });
  }
}

async function loadVideo() {
    let blob = await fetch('/debugVideos/' + debugVideo + '.mp4', {
        headers: {
            'x-api-key': API_KEY
        }
    })
    .then(response => response.blob());

    var videoUrl=createObjectURL(blob);
    video.src = videoUrl;

}

function createObjectURL(object) {
    return (window.URL) ? window.URL.createObjectURL(object) : window.webkitURL.createObjectURL(object);
}

let lastVideoTime = 0;
let lastFrameTime = performance.now();
let loading = false;

async function predict() {
    let currentTime = performance.now();
    let timeDiff = currentTime - lastFrameTime; // in ms

    // if less than 33.33ms has passed (which is roughly 30 FPS), skip this frame
    if (timeDiff < 33.33) {
      window.requestAnimationFrame(predict);
      return;
    }
    lastFrameTime = currentTime; // update last frame time

    if (loading) {
      window.requestAnimationFrame(predict);
      return;
    }
    loading = true;

    // Now let's start detecting the stream.
    if (runningMode === "IMAGE") {
        runningMode = "VIDEO"
        await poseLandmarker.setOptions({ runningMode: "VIDEO" })
    }

    let startTimeMs = performance.now();
    if (lastVideoTime === 0 || lastVideoTime !== video.currentTime) {
        if(lastVideoTime === 0) {
            lastVideoTime = video.currentTime;
        }
        let timeSinceLastFrame = video.currentTime - lastVideoTime;
        lastVideoTime = video.currentTime

        poseLandmarker.detectForVideo(
            canvasElement,
            startTimeMs,
            result => {
              if(result.landmarks.length > 0) {
                  const landmarks = result.landmarks[0];
                  const worldLandmarks = result.worldLandmarks[0];

                  const poseData = landmarks.map(
                    (landmark, index) => {
                        return {
                            imageX: landmark.x,
                            imageY: landmark.y,
                            worldX: worldLandmarks[index].x,
                            worldY: worldLandmarks[index].y,
                            worldZ: worldLandmarks[index].z,
                            visibility: landmark.visibility,
                        };
                    }
                  );


                  sendPoseMessageHandler.postMessage(JSON.stringify({"data": poseData}));
              }
        });
      }
    loading = false;
    if (webcamRunning === true) {
      window.requestAnimationFrame(predict)
    }
}

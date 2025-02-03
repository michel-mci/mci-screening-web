import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GroundedSkybox } from 'three/addons/objects/GroundedSkybox.js';

async function loadEnvironment(environmentId, scene) {
    if(environmentId === 'gym'){
        const environmentMap = await window.loadRgbeFromServer('textures/environment.hdr');
        environmentMap.mapping = THREE.EquirectangularReflectionMapping;
        window.environmentData.environmentMap = environmentMap;
        const skybox = new GroundedSkybox(environmentMap, 15, 70);

        scene.add(skybox);
        scene.environment = window.environmentData.environmentMap;

        const gymGltf = await window.loadGltfFromServer('cache/animations/environments/gym.glb');
        gymGltf.scene.position.y = -0.01;
        const gymScene = gymGltf.scene;

        scene.add(gymScene);

        return;
    }

    if(environmentId === 'ice'){
        const textureLoader = new THREE.TextureLoader();

        const environmentMap = await window.loadRgbeFromServer('textures/environment-ice.hdr');
        environmentMap.mapping = THREE.EquirectangularReflectionMapping
        window.environmentData.environmentMap = environmentMap;
        const skybox = new GroundedSkybox(environmentMap, 15, 70);

        scene.add(skybox);
        scene.environment = window.environmentData.environmentMap;

        const floorTexture = await fetch('textures/floor.jpg', {
            headers: {
                'x-api-key': API_KEY
            }
        })
        .then(response => response.blob())
        .then(blob => {
            const url = URL.createObjectURL(blob);

            return textureLoader.load(url);
        });
        floorTexture.wrapS = THREE.RepeatWrapping;
        floorTexture.wrapT = THREE.RepeatWrapping;
        floorTexture.repeat.set(15,15);

        const floorMaterial = new THREE.ShaderMaterial({
          uniforms: {
            textureSampler: { value: floorTexture },
            textureRepeat: { value: floorTexture.repeat },
            radius: { value: 0.5 }
          },
          vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            uniform sampler2D textureSampler;
            uniform vec2 textureRepeat;
            uniform float radius;
            varying vec2 vUv;
            void main() {
                vec4 texColor = texture(textureSampler, vUv * textureRepeat);
                float distanceFromCenter = length(vUv - vec2(0.5));
                float factor = smoothstep(0.0, radius, distanceFromCenter);
                factor = clamp(factor, 0.0, 1.0);
                gl_FragColor = vec4(texColor.rgb, 1.0 - factor); // Fade to transparency
            }
          `,
          transparent: true,
        });

        // Create the floor geometry
        const floorGeometry = new THREE.PlaneGeometry(40, 40);

        // Create the floor mesh
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0;

        scene.add(floor);

        return;
    }
}

// Debug
var timerStart = Date.now();

console.log("Time at start: ", Date.now()-timerStart);

// Retrieve the model URLs from the query parameters
const urlParams = new URLSearchParams(window.location.search);
const trainer = urlParams.get('trainer');
const exercise = urlParams.get('exercise');
const environment = urlParams.get('environment');
// Create a scene
const scene = new THREE.Scene();

const sizes = {
    width: window.innerWidth,
    height: window.innerHeight,
}

window.addEventListener('resize', () => {
    sizes.width = window.innerWidth;
    sizes.height = window.innerHeight;

    camera.aspect = sizes.width / sizes.height;
    camera.updateProjectionMatrix();

    renderer.setSize(sizes.width, sizes.height);
});

window.environmentData = {
    currentEnvironment: -1,
    loadingEnvironment: false,
    backgroundColor: 0x222222,
    environmentMap: undefined,

}

// Create a camera
const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height);
camera.near = 0.05;
scene.add(camera);

const canvas = document.getElementById('canvas');

// Create a renderer
const renderer = new THREE.WebGLRenderer( {canvas: canvas} );
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(window.environmentData.backgroundColor, 1);
renderer.outputEncoding = THREE.sRGBEncoding;

// Controls
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.enablePan = false
controls.minDistance = 2
controls.maxDistance = 5
controls.minPolarAngle = Math.PI * 0.1;
controls.maxPolarAngle = Math.PI * 0.45;
controls.autoRotate = true;
controls.autoRotateSpeed = -1.0;
controls.dampingFactor = 0.3;

canvas.addEventListener('touchstart', function() {
    controls.autoRotate = false;
});

let mixerCharacter;

const clock = new THREE.Clock()
let previousTime = 0;

/**
 * Lights
 */
const ambientLight = new THREE.AmbientLight(0xffffff, 1)
scene.add(ambientLight)

const directionalLight = new THREE.DirectionalLight(0xffffff, 2)
directionalLight.position.set(0, 3, 0)
scene.add(directionalLight)

let speed = 1;

window.togglePause = function(){
    speed = 1 - speed;
    controls.autoRotate = false;
}

const tick = () =>
{
    const currentTime = clock.getElapsedTime()
    const deltaTime = currentTime - previousTime;
    previousTime = currentTime;

    controls.update();

    // Limit camera height
    if(camera.position.y > 4){
        camera.position.y = 4;
    }

    if ( mixerCharacter ){
        mixerCharacter.update( deltaTime * speed );
    }

    // Render
    renderer.render(scene, camera)


    // Call tick again on the next frame
    window.requestAnimationFrame(tick)
}

tick()

let sceneLoaded = false;

const environmentWrapper = new THREE.Object3D();
scene.add(environmentWrapper);

console.log("Time before loading scene: ", Date.now()-timerStart);

function loadGltfFromServer(path){
    return new Promise((resolve, reject) => {
        fetch(path, {
            headers: {
                'x-api-key': API_KEY
            }
        })
        .then(response => response.blob())
        .then(blob => {
            const url = URL.createObjectURL(blob);

            const loader = new GLTFLoader();
            loader.load(url, (gltf) => {
                resolve(gltf);
            }, undefined, (error) => {
                reject(error);
            });
        })
        .catch((error) => {
            reject(error);
        });
    });
}
window.loadGltfFromServer = loadGltfFromServer;

function loadRgbeFromServer(path) {
    return new Promise((resolve, reject) => {
        fetch(path, {
            headers: {
                'x-api-key': API_KEY
            }
        })
        .then(response => response.blob())
        .then(blob => {
            const url = URL.createObjectURL(blob);

            const rgbeLoader = new RGBELoader();

            return rgbeLoader.load(url, (rgbe) => {
                resolve(rgbe);
            }, undefined, (error) => {
                reject(error);
            });
        })
        .catch((error) => {
            reject(error);
        });
    });
}
window.loadRgbeFromServer = loadRgbeFromServer;

loadScene();

async function loadScene () {
try{
    await loadEnvironment(environment, scene, timerStart);

    console.log("Environment loaded: ", Date.now()-timerStart);
    scene.environment = window.environmentData.environmentMap;

    // Load Exercise
    const exerciseGltf = await loadGltfFromServer(exercise);
    const exerciseScene = exerciseGltf.scene;

    console.log("Exercise loaded: ", Date.now()-timerStart);

    // Load Trainer
    const trainerGltf = await loadGltfFromServer(trainer);

    console.log("Trainer loaded: ", Date.now()-timerStart);
    if(exerciseScene == null){
        return;
    }

    const trainerPlaceholder = exerciseScene.getObjectByName('Trainer');

    const placeholderChildCount = trainerPlaceholder.children.length;

    for(let j = 0; j < placeholderChildCount; j++){
        trainerPlaceholder.remove(trainerPlaceholder.children[0]);
    }

    let newTrainer = trainerGltf.scene.children[0];

    newTrainer.traverse((child) => {
        child.name = child.name.replace('.001','')
        child.name = child.name.replace('.002','')
        child.name = child.name.replace('.003','')
        child.name = child.name.replace('.004','')
        child.name = child.name.replace('.005','')
        child.name = child.name.replace('.006','')
        child.name = child.name.replace('.007','')
        child.name = child.name.replace('.008','')
        child.name = child.name.replace('.009','')
        child.name = child.name.replace('001','')
        child.name = child.name.replace('002','')
        child.name = child.name.replace('003','')
        child.name = child.name.replace('004','')
        child.name = child.name.replace('005','')
        child.name = child.name.replace('006','')
        child.name = child.name.replace('007','')
        child.name = child.name.replace('008','')
        child.name = child.name.replace('009','')
    });

    const childCount = newTrainer.children.length;
    for(let i = 0; i < childCount; i++){
        trainerPlaceholder.add(newTrainer.children[0]);
    }

    let initialCameraPos;
    let targetPos;

    exerciseScene.traverse((child) => {
        if(child.name === 'InitialCameraPos'){
            initialCameraPos = child.position;
        }
        if(child.name === 'Target'){
            targetPos = child.position;
        }

        if(child.isMesh){
            if(child.material.name.startsWith("Scalp")){
                child.material.transparent = true;
                child.material.depthWrite = false;
                child.material.depthTest = true;
                child.renderOrder = 900;
            }
            if(child.material.name.startsWith("Hair")){
                child.material.transparent = true;
                child.material.depthWrite = false;
                child.material.depthTest = true;
                child.renderOrder = 1000;
            }

            child.material.envMap = window.environmentData.environmentMap;
            child.material.envMapIntensity = 0.3;
        }
    })

    if(initialCameraPos){
        camera.position.x = initialCameraPos.x;
        camera.position.y = initialCameraPos.y;
        camera.position.z = initialCameraPos.z;
    }
    if(targetPos){
        camera.lookAt(targetPos);
        controls.target = targetPos;
    }

    mixerCharacter = new THREE.AnimationMixer(exerciseScene);
    const action = mixerCharacter.clipAction(exerciseGltf.animations[0]);
    action.play();

    scene.add(exerciseScene);

    console.log("Trainer added: ", Date.now()-timerStart);

    window.requestAnimationFrame(() => {
        canvas.classList.add('visible');
        loadedMessageHandler.postMessage('success');
    });

    }catch(e){
        loadedMessageHandler.postMessage(e.message);
    }
}
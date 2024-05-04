import * as THREE from 'three';
import { Controls } from './Controls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import * as SHADERS from './shaders.js';

const playerHeight = 1;

let camera, scene, renderer, light, sun, controls;

let startLocation = new THREE.Vector3(0, playerHeight, 0);
let objects = [];
let animatedObjects = [];
let loader = new GLTFLoader();
let clock = new THREE.Clock();
let isLoading = true;
let answer = undefined;
let answerJSON = undefined;
let score = 0;
let difficulty = 500;
let hintsGiven = 0;
let sky;
let verifiedLevels = fetch("https://grab-tools.live/stats_data/all_verified.json").then(response => response.json());
let textMaterial = new THREE.MeshBasicMaterial({color: 0xffffff});
let endLocation = new THREE.Vector3(0, playerHeight, 0);
let signLocations = [];
let signPositions = [];

let materialList = [
    'textures/default.png',
    'textures/grabbable.png',
    'textures/ice.png',
    'textures/lava.png',
    'textures/wood.png',
    'textures/grapplable.png',
    'textures/grapplable_lava.png',
    'textures/grabbable_crumbling.png',
    'textures/default_colored.png',
    'textures/bouncing.png'
];
let shapeList = [
    'models/cube.gltf',
    'models/sphere.gltf',
    'models/cylinder.gltf',
    'models/pyramid.gltf',
    'models/prism.gltf',
    'models/sign.gltf',
    'models/start_end.gltf'
];

let sunAngle;
let sunAltitude;
let horizonColor;

let startMaterial, finishMaterial, skyMaterial, signMaterial, neonMaterial;
let materials = [];
let objectMaterials = [];
let shapes = [];

let PROTOBUF_DATA = `
syntax = "proto3";

package COD.Level;

message Level
{
  uint32 formatVersion = 1;

  string title = 2;
  string creators = 3;
  string description = 4;
  uint32 complexity = 5;
  uint32 maxCheckpointCount = 7;

  AmbienceSettings ambienceSettings = 8;

  repeated LevelNode levelNodes = 6;
}

message Vector
{
	float x = 1;
	float y = 2;
	float z = 3;
}

message Quaternion
{
	float x = 1;
	float y = 2;
	float z = 3;
	float w = 4;
}

message Color
{
	float r = 1;
	float g = 2;
	float b = 3;
	float a = 4;
}

message AmbienceSettings
{
	Color skyZenithColor = 1;
	Color skyHorizonColor = 2;

	float sunAltitude = 3;
	float sunAzimuth = 4;
	float sunSize = 5;

	float fogDDensity = 6;
}

enum LevelNodeShape
{
	START = 0;
	FINISH = 1;
	SIGN = 2;

	__END_OF_SPECIAL_PARTS__ = 3;

	CUBE = 1000;
	SPHERE = 1001;
	CYLINDER = 1002;
	PYRAMID = 1003;
	PRISM = 1004;
}

enum LevelNodeMaterial
{
	DEFAULT = 0;
	GRABBABLE = 1;
	ICE = 2;
	LAVA = 3;
	WOOD = 4;
	GRAPPLABLE = 5;
	GRAPPLABLE_LAVA = 6;

	GRABBABLE_CRUMBLING= 7;
	DEFAULT_COLORED = 8;
	BOUNCING = 9;
}

message LevelNodeGroup
{
	Vector position = 1;
	Vector scale = 2;
	Quaternion rotation = 3;

	repeated LevelNode childNodes = 4;
}

message LevelNodeStart
{
	Vector position = 1;
	Quaternion rotation = 2;
	float radius = 3;
}

message LevelNodeFinish
{
	Vector position = 1;
	float radius = 2;
}

message LevelNodeStatic
{
	LevelNodeShape shape = 1;
	LevelNodeMaterial material = 2;

	Vector position = 3;
	Vector scale = 4;
	Quaternion rotation = 5;

	Color color = 6;
	bool isNeon = 7;
}

message LevelNodeCrumbling
{
	LevelNodeShape shape = 1;
	LevelNodeMaterial material = 2;

	Vector position = 3;
	Vector scale = 4;
	Quaternion rotation = 5;

	float stableTime = 6;
	float respawnTime = 7;
}

message LevelNodeSign
{
	Vector position = 1;
	Quaternion rotation = 2;

	string text = 3;
}

message AnimationFrame
{
	float time = 1;
	Vector position = 2;
	Quaternion rotation = 3;
}

message Animation
{
	enum Direction
	{
		RESTART = 0;
		PINGPONG = 1;
	}

	string name = 1;
	repeated AnimationFrame frames = 2;
	Direction direction = 3;
	float speed = 4;
}

message LevelNode
{
	bool isLocked = 6;

	oneof content
	{
		LevelNodeStart levelNodeStart = 1;
		LevelNodeFinish levelNodeFinish = 2;
		LevelNodeStatic levelNodeStatic = 3;
		LevelNodeSign levelNodeSign = 4;
		LevelNodeCrumbling levelNodeCrumbling = 5;
		LevelNodeGroup levelNodeGroup = 7;
	}

	repeated Animation animations = 15;
}
`

function loadTexture(path) {
    return new Promise((resolve) => {
        const texture = new THREE.TextureLoader().load(path, function (texture) {
            resolve(texture);
        });
    });
}

function loadModel(path) {
    return new Promise((resolve) => {
        loader.load(path, function (gltf) {
            const glftScene = gltf.scene;
            resolve(glftScene.children[0]);
        });
    });
}

async function initAttributes() {
    for (const path of materialList) {
        const texture = await loadTexture(path);
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        let material = new THREE.ShaderMaterial({
            vertexShader: SHADERS.levelVS,
            fragmentShader: SHADERS.levelFS,
            uniforms: {
                "colorTexture": { value: texture },
                "tileFactor": { value: 1.1 },
                "diffuseColor": { value: [1.0, 1.0, 1.0] },
                "worldNormalMatrix": { value: new THREE.Matrix3() },
                "neonEnabled": { value: 0.0 },
                "fogEnabled": { value: 1.0 },
                "specularColor": { value: [0.3, 0.3, 0.3, 16.0]}
            }
        });
        materials.push(material);
    }

    for (const path of shapeList) {
        const model = await loadModel(path);
        shapes.push(model);
    }

    startMaterial = new THREE.ShaderMaterial();
	startMaterial.vertexShader = SHADERS.startFinishVS;
	startMaterial.fragmentShader = SHADERS.startFinishFS;
	startMaterial.flatShading = true;
	startMaterial.transparent = true;
	startMaterial.depthWrite = false;
	startMaterial.uniforms = { "diffuseColor": {value: [0.0, 1.0, 0.0, 1.0]}};
	objectMaterials.push(startMaterial);

	finishMaterial = new THREE.ShaderMaterial();
	finishMaterial.vertexShader = SHADERS.startFinishVS;
	finishMaterial.fragmentShader = SHADERS.startFinishFS;
	finishMaterial.flatShading = true;
	finishMaterial.transparent = true;
	finishMaterial.depthWrite = false;
	finishMaterial.uniforms = { "diffuseColor": {value: [1.0, 0.0, 0.0, 1.0]}};
	objectMaterials.push(finishMaterial);
    
    skyMaterial = new THREE.ShaderMaterial();
    skyMaterial.vertexShader = SHADERS.skyVS;
    skyMaterial.fragmentShader = SHADERS.skyFS;
    skyMaterial.flatShading = false;
    skyMaterial.depthWrite = false;
    skyMaterial.side = THREE.BackSide;

    signMaterial = materials[4].clone();
    signMaterial.uniforms.colorTexture = materials[4].uniforms.colorTexture;
    signMaterial.vertexShader = SHADERS.signVS;
    signMaterial.fragmentShader = SHADERS.signFS;
    objectMaterials.push(signMaterial);
    
    neonMaterial = materials[8].clone();
    neonMaterial.uniforms.colorTexture = materials[8].uniforms.colorTexture;
    neonMaterial.uniforms.specularColor.value = [0.4, 0.4, 0.4, 64.0];
    neonMaterial.uniforms.neonEnabled.value = 1.0;
    objectMaterials.push(neonMaterial);

    sunAngle = new THREE.Euler(THREE.MathUtils.degToRad(45), THREE.MathUtils.degToRad(315), 0.0)
    sunAltitude = 45.0
    horizonColor = [0.916, 0.9574, 0.9574]
}

function readArrayBuffer(file) {
    return new Promise(function(resolve, reject) {
        let reader = new FileReader();
        reader.onload = function() {
            let data = reader.result;
            let {root} = protobuf.parse(PROTOBUF_DATA, { keepCase: true });
            console.log(root);
            let message = root.lookupType("COD.Level.Level");
            let decoded = message.decode(new Uint8Array(data));
            let object = message.toObject(decoded);
            resolve(object);
        }
        reader.onerror = function() {
            reject(reader);
        }
        reader.readAsArrayBuffer(file);
    });
}

async function openProto(link) {
    let response = await fetch(link);
    let data = await response.arrayBuffer();

    let blob = new Blob([data]);
    let level = await readArrayBuffer(blob);
    
    return level;
}

async function init() {

    THREE.ColorManagement.enabled = true;

    renderer = new THREE.WebGLRenderer({antialias: true, preserveDrawingBuffer: true});
    renderer.setSize( window.innerWidth, window.innerHeight );
    renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.setClearColor(new THREE.Color(143.0/255.0, 182.0/255.0, 221.0/255.0), 1.0);
    document.getElementById("viewport").appendChild( renderer.domElement );
    renderer.setPixelRatio(window.devicePixelRatio);

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 10000 );
    camera.position.set( 0, playerHeight, 0 );

    light = new THREE.AmbientLight(0x404040);
    scene.add(light);
    sun = new THREE.DirectionalLight( 0xffffff, 0.5 );
    scene.add( sun );

    controls = new Controls( camera, renderer.domElement );
    scene.add( controls.getObject() );

    window.addEventListener( 'resize', onWindowResize );

    let randomButton = document.getElementById("randomButton");
    
    randomButton.addEventListener( 'click', () => {
        createPopup();
        displayScore();
        loadRandomLevel();
    });

    await initAttributes();

    await loadRandomLevel();

    animate();
}

async function loadRandomLevel() {
    const weights = [];
    verifiedLevels.then(async levels => {
        const sorted = [...levels].sort((a, b) => b?.statistics?.total_played - a?.statistics?.total_played);
        const randomLevel = sorted[Math.floor(Math.random() * Math.min(difficulty, sorted.length - 1))];
        answer = randomLevel.identifier;
        answerJSON = randomLevel;
        hintsGiven = 0;
        hintButtons.forEach(button => {
            button.classList.remove("unlocked");
        });
        startHint.classList.add("unlocked");
        displayBonus();
        const downloadUrl = `https://api.slin.dev/grab/v1/download/${randomLevel.data_key.replace("level_data:", "").split(":").join("/")}`;
        let level =  await openProto(downloadUrl);
        await loadLevel(level);
    });
}

function displayScore() {
    document.getElementById("score").innerText = `Score: ${score}`;
}
function displayBonus() {
    document.getElementById("bonus").innerText = `+ ${(5 - hintsGiven) * 1000}`;
}

function guess(identifier) {
    if (identifier == answer) {
        score += (5 - hintsGiven) * 1000;
    } else {
        createPopup();
    }
    displayScore();
    loadRandomLevel();
}

let difficultyButtons = document.querySelectorAll(".diff");
difficultyButtons.forEach(button => {
    button.addEventListener("click", () => {
        difficulty = parseInt(button.id);
        difficultyButtons.forEach(b => {
            b.classList.remove("difficulty");
        });
        button.classList.add("difficulty");
    });
});

const hintButtons = document.querySelectorAll(".hint");
hintButtons.forEach(button => {
    button.addEventListener("click", () => {
        if (!button.className.includes('unlocked')) {
            hintsGiven += 1;
            displayBonus();
            button.classList.add("unlocked");
        }
    });
});

const startHint = document.getElementById("start-hint");
const finishHint = document.getElementById("finish-hint");
const signHint = document.getElementById("sign-hint");
const fogHint = document.getElementById("fog-hint");
let signIter = 0;

startHint.addEventListener("click", () => {
    signIter = 0;
    camera.position.copy(startLocation);
});
finishHint.addEventListener("click", () => {
    signIter = 0;
    camera.position.copy(endLocation);
});
signHint.addEventListener("click", () => {
    camera.position.copy(signLocations[signIter]);
    camera.lookAt(signPositions[signIter]);
    signIter = (signIter + 1) % signLocations.length;
});
fogHint.addEventListener("click", () => {
    scene.traverse(function(node) {
		if(node instanceof THREE.Mesh && node?.geometry?.type != "TextGeometry") {
			if("material" in node && "fogEnabled" in node.material.uniforms) {
				node.material.uniforms["fogEnabled"].value = 0.0;
			}
		}
	})
});

async function loadSearch() {
    let query = document.getElementById("search").value;
    document.getElementById("cards").innerHTML = "";
    verifiedLevels.then(levels => {
        let results = levels.filter(l => (
            l.title.toLowerCase().replace(" ", "").includes(query.toLowerCase().replace(" ", "")) ||
            (l?.creators || []).toString().toLowerCase().replace(" ", "").includes(query.toLowerCase().replace(" ", ""))
        ));
        if (query.charAt(0) == '"' && query.charAt(query.length - 1) == '"') {
            query = query.substring(1, query.length - 1);
            results = levels.filter(l => (
                l.title.toLowerCase().replace(" ", "") == (query.toLowerCase().replace(" ", "")) ||
                l.title.toLowerCase().replace(" ", "") == (query.toLowerCase()) ||
                l.title.toLowerCase() == (query.toLowerCase().replace(" ", "")) ||
                l.title.toLowerCase() == (query.toLowerCase())
            ));
        }
        if (results.length > 0) {
            for (let i = 0; i < Math.min(results.length, 100); i++) {
                let card = document.createElement("div");
                card.className = "card";
                let thumbnail = document.createElement("img");
                thumbnail.onerror = () => {
                    thumbnail.style.display = "none";
                };
                thumbnail.src = "https://grab-images.slin.dev/" + results[i]?.images?.thumb?.key;
                card.appendChild(thumbnail);
                let title = document.createElement("h3");
                title.innerText = results[i].title;
                title.className = "title";
                card.appendChild(title);
                let creators = document.createElement("p");
                creators.innerText = results[i].creators;
                creators.className = "creators";
                card.appendChild(creators);
                document.getElementById("cards").appendChild(card);
                card.addEventListener("click", async () => {
                    guess(results[i].identifier);
                });
            }
        }
    });
}
document.getElementById("search-submit").addEventListener("click", loadSearch);

async function loadLevel(level) {
    scene = new THREE.Scene();
    objects = [];
    animatedObjects = [];
    objects.push(controls.getObject());

    scene.add(light);
    scene.add(sun);
    scene.add(camera);
    
    let ambience = level.ambienceSettings;
    
    console.log(ambience);
    
    if (ambience) {
        if (ambience.skyHorizonColor) {
            ambience.skyHorizonColor?.r ? null : ambience.skyHorizonColor.r = 0;
            ambience.skyHorizonColor?.g ? null : ambience.skyHorizonColor.g = 0;
            ambience.skyHorizonColor?.b ? null : ambience.skyHorizonColor.b = 0;
        }
        if (ambience.skyZenithColor) {
            ambience.skyZenithColor?.r ? null : ambience.skyZenithColor.r = 0;
            ambience.skyZenithColor?.g ? null : ambience.skyZenithColor.g = 0;
            ambience.skyZenithColor?.b ? null : ambience.skyZenithColor.b = 0;
        }
        ambience.sunAltitude ? null : ambience.sunAltitude = 0;
        ambience.sunAzimuth ? null : ambience.sunAzimuth = 0;
        ambience.sunSize ? null : ambience.sunSize = 0;
        ambience.fogDDensity ? null : ambience.fogDDensity = 0;

        sunAngle = new THREE.Euler(THREE.MathUtils.degToRad(ambience.sunAltitude), THREE.MathUtils.degToRad(ambience.sunAzimuth), 0.0);

        skyMaterial.uniforms["cameraFogColor0"] = { value: [ambience.skyHorizonColor.r, ambience.skyHorizonColor.g, ambience.skyHorizonColor.b] }
        skyMaterial.uniforms["cameraFogColor1"] = { value: [ambience.skyZenithColor.r, ambience.skyZenithColor.g, ambience.skyZenithColor.b] }
        skyMaterial.uniforms["sunSize"] = { value: ambience.sunSize }

        sunAltitude = ambience.sunAltitude
        horizonColor = [ambience.skyHorizonColor.r, ambience.skyHorizonColor.g, ambience.skyHorizonColor.b]
    } else {
        skyMaterial.uniforms["cameraFogColor0"] = { value: [0.916, 0.9574, 0.9574] }
        skyMaterial.uniforms["cameraFogColor1"] = { value: [0.28, 0.476, 0.73] }
        skyMaterial.uniforms["sunSize"] = { value: 1.0 }
    }

    const sunDirection = new THREE.Vector3( 0, 0, 1 );
    sunDirection.applyEuler(sunAngle);

    const skySunDirection = sunDirection.clone()
    skySunDirection.x = skySunDirection.x;
    skySunDirection.y = skySunDirection.y;
    skySunDirection.z = skySunDirection.z;

    let sunColorFactor = 1.0 - sunAltitude / 90.0
    sunColorFactor *= sunColorFactor
    sunColorFactor = 1.0 - sunColorFactor
    sunColorFactor *= 0.8
    sunColorFactor += 0.2
    let sunColor = [horizonColor[0] * (1.0 - sunColorFactor) + sunColorFactor, horizonColor[1] * (1.0 - sunColorFactor) + sunColorFactor, horizonColor[2] * (1.0 - sunColorFactor) + sunColorFactor]

    console.log(sunColor);
    skyMaterial.uniforms["sunDirection"] = { value: skySunDirection }
    skyMaterial.uniforms["sunColor"] = { value: sunColor }

    sky = new THREE.Mesh(shapes[1].geometry, skyMaterial);
    sky.frustumCulled = false
    sky.renderOrder = 1000 //sky should be rendered after opaque, before transparent
    scene.add(sky);
    console.log(sky);
    // document.body.style.backgroundImage = `linear-gradient(rgb(${sky[0][0]}, ${sky[0][1]}, ${sky[0][2]}), rgb(${sky[1][0]}, ${sky[1][1]}, ${sky[1][2]}), rgb(${sky[0][0]}, ${sky[0][1]}, ${sky[0][2]}))`;
    function updateMaterial(material) {
        let density = 0.0
        if(ambience)
        {
            material.uniforms["cameraFogColor0"] = { value: [ambience.skyHorizonColor.r, ambience.skyHorizonColor.g, ambience.skyHorizonColor.b] }
            material.uniforms["cameraFogColor1"] = { value: [ambience.skyZenithColor.r, ambience.skyZenithColor.g, ambience.skyZenithColor.b] }
            material.uniforms["sunSize"] = { value: ambience.sunSize }
            density = ambience.fogDDensity;
        }
        else
        {
            material.uniforms["cameraFogColor0"] = { value: [0.916, 0.9574, 0.9574] }
            material.uniforms["cameraFogColor1"] = { value: [0.28, 0.476, 0.73] }
            material.uniforms["sunSize"] = { value: 1.0 }
        }

        material.uniforms["sunDirection"] = { value: skySunDirection }
        material.uniforms["sunColor"] = { value: sunColor }

        let densityFactor = density * density * density * density
        let fogDensityX = 0.5 * densityFactor + 0.000001 * (1.0 - densityFactor)
        let fogDensityY = 1.0/(1.0 - Math.exp(-1500.0 * fogDensityX))

        material.uniforms["cameraFogDistance"] = { value: [fogDensityX, fogDensityY] }
			
    }
    
    for (let material of materials) {
        updateMaterial(material);
    }
    for (let material of objectMaterials) {
        updateMaterial(material);
    }

    level.levelNodes.forEach(node => {
        loadLevelNode(node, scene);
    });

    console.log(level);
    console.log(objects);
    console.log(scene);
    isLoading = false;
}

function createPopup() {
    console.log(answerJSON);
    let card = document.createElement("div");
    card.className = "card popup";
    let thumbnail = document.createElement("img");
    thumbnail.onerror = () => {
        thumbnail.style.display = "none";
    };
    thumbnail.src = "https://grab-images.slin.dev/" + answerJSON?.images?.thumb?.key;
    card.appendChild(thumbnail);
    let title = document.createElement("h3");
    title.innerText = answerJSON.title;
    title.className = "title";
    card.appendChild(title);
    let creators = document.createElement("p");
    creators.innerText = answerJSON.creators;
    creators.className = "creators";
    card.appendChild(creators);
    document.body.appendChild(card);
    card.addEventListener("click", () => {
        card.remove();
    });
}

function loadLevelNode(node, parent) {
    let object = undefined;
    if (node.levelNodeGroup) {
        object = new THREE.Object3D();
        objects.push( object );
        parent.add( object );

        object.position.x = -node.levelNodeGroup.position.x || 0;
        object.position.y = node.levelNodeGroup.position.y || 0;
        object.position.z = -node.levelNodeGroup.position.z || 0;
        object.scale.x = node.levelNodeGroup.scale.x || 0;
        object.scale.y = node.levelNodeGroup.scale.y || 0;
        object.scale.z = node.levelNodeGroup.scale.z || 0;
        object.quaternion.x = -node.levelNodeGroup.rotation.x || 0;
        object.quaternion.y = node.levelNodeGroup.rotation.y || 0;
        object.quaternion.z = -node.levelNodeGroup.rotation.z || 0;
        object.quaternion.w = node.levelNodeGroup.rotation.w || 0;
        
        object.initialPosition = object.position.clone();
        object.initialRotation = object.quaternion.clone();
        
        node.levelNodeGroup.childNodes.forEach(node => {
            loadLevelNode(node, object);
        });
    } else if (node.levelNodeGravity) {

        let particleGeometry = new THREE.BufferGeometry();

        let particleColor = new THREE.Color(1.0, 1.0, 1.0);
        if (node.levelNodeGravity?.mode == 1) {
            particleColor = new THREE.Color(1.0, 0.6, 0.6);
        }
        let particleMaterial = new THREE.PointsMaterial({ color: particleColor, size: 0.05 });

        object = new THREE.Object3D()
        parent.add(object);

        object.position.x = -node.levelNodeGravity.position.x || 0;
        object.position.y = node.levelNodeGravity.position.y || 0;
        object.position.z = -node.levelNodeGravity.position.z || 0;

        object.scale.x = node.levelNodeGravity.scale.x || 0;
        object.scale.y = node.levelNodeGravity.scale.y || 0;
        object.scale.z = node.levelNodeGravity.scale.z || 0;

        object.quaternion.x = -node.levelNodeGravity.rotation.x || 0;
        object.quaternion.y = node.levelNodeGravity.rotation.y || 0;
        object.quaternion.z = -node.levelNodeGravity.rotation.z || 0;
        object.quaternion.w = node.levelNodeGravity.rotation.w || 0;

        object.initialPosition = object.position.clone();
        object.initialRotation = object.quaternion.clone();

        let particleCount = Math.floor(object.scale.x * object.scale.y * object.scale.z)
        particleCount = Math.min(particleCount, 2000);
        let particlePositions = [];

        for (let i = 0; i < particleCount; i++) {
            let x = (Math.random() - 0.5) * object.scale.x;
            let y = (Math.random() - 0.5) * object.scale.y;
            let z = (Math.random() - 0.5) * object.scale.z;

            particlePositions.push(x, y, z);
        }

        particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(particlePositions, 3));
        let particles = new THREE.Points(particleGeometry, particleMaterial);
        object.add(particles);
        objects.push(object);
    } else if (node.levelNodeStatic) { 
        // if (node.levelNodeStatic.shape-1000 >= 0 && node.levelNodeStatic.shape-1000 < shapes.length) {
        //     object = shapes[node.levelNodeStatic.shape-1000].clone();
        // } else {
        //     object = shapes[0].clone();
        // }
        let material = materials[0].clone();
        if (node.levelNodeStatic.material && node.levelNodeStatic.material >= 0 && node.levelNodeStatic.material < materials.length) {
            material = materials[node.levelNodeStatic.material].clone();
        }
        if (node.levelNodeStatic.material == 8) {
            if (node.levelNodeStatic.isNeon) {
                material = objectMaterials[3].clone();
            }
            node.levelNodeStatic.color.r ? null : node.levelNodeStatic.color.r = 0;
            node.levelNodeStatic.color.g ? null : node.levelNodeStatic.color.g = 0;
            node.levelNodeStatic.color.b ? null : node.levelNodeStatic.color.b = 0;
            material.uniforms.diffuseColor.value = [node.levelNodeStatic.color.r, node.levelNodeStatic.color.g, node.levelNodeStatic.color.b]
            const specularFactor = Math.sqrt(node.levelNodeStatic.color.r * node.levelNodeStatic.color.r + node.levelNodeStatic.color.g * node.levelNodeStatic.color.g + node.levelNodeStatic.color.b * node.levelNodeStatic.color.b) * 0.15
            material.uniforms.specularColor.value = [specularFactor, specularFactor, specularFactor, 16.0]
        }
        object = new THREE.Mesh(shapes[node?.levelNodeStatic?.shape-1000 || 0].geometry, material);
        // object.material = material;
        parent.add(object);
        object.position.x = -node.levelNodeStatic.position.x || 0;
        object.position.y = node.levelNodeStatic.position.y || 0;
        object.position.z = -node.levelNodeStatic.position.z || 0;
        object.quaternion.w = node.levelNodeStatic.rotation.w || 0;
        object.quaternion.x = -node.levelNodeStatic.rotation.x || 0;
        object.quaternion.y = node.levelNodeStatic.rotation.y || 0;
        object.quaternion.z = -node.levelNodeStatic.rotation.z || 0;
        object.scale.x = node.levelNodeStatic.scale.x || 0;
        object.scale.y = node.levelNodeStatic.scale.y || 0;
        object.scale.z = node.levelNodeStatic.scale.z || 0;

        object.initialPosition = object.position.clone();
        object.initialRotation = object.quaternion.clone();

        let targetVector = new THREE.Vector3();
        let targetQuaternion = new THREE.Quaternion();
        let worldMatrix = new THREE.Matrix4();
        worldMatrix.compose(
            object.getWorldPosition(targetVector), 
            object.getWorldQuaternion(targetQuaternion), 
            object.getWorldScale(targetVector)
        );

        let normalMatrix = new THREE.Matrix3();
        normalMatrix.getNormalMatrix(worldMatrix);
        material.uniforms.worldNormalMatrix.value = normalMatrix;

        objects.push(object);

    } else if (node.levelNodeCrumbling) {
        let material;
        // if (node.levelNodeCrumbling.shape-1000 >= 0 && node.levelNodeCrumbling.shape-1000 < shapes.length) {
        //     object = shapes[node.levelNodeCrumbling.shape-1000].clone();
        // } else {
        //     object = shapes[0].clone();
        // }
        material = materials[7].clone();

        object = new THREE.Mesh(shapes[node?.levelNodeCrumbling?.shape-1000 || 0].geometry, material);
        // object.material = material;
        parent.add(object);
        object.position.x = -node.levelNodeCrumbling.position.x || 0;
        object.position.y = node.levelNodeCrumbling.position.y || 0;
        object.position.z = -node.levelNodeCrumbling.position.z || 0;
        object.quaternion.w = node.levelNodeCrumbling.rotation.w || 0;
        object.quaternion.x = -node.levelNodeCrumbling.rotation.x || 0;
        object.quaternion.y = node.levelNodeCrumbling.rotation.y || 0;
        object.quaternion.z = -node.levelNodeCrumbling.rotation.z || 0;
        object.scale.x = node.levelNodeCrumbling.scale.x || 0;
        object.scale.y = node.levelNodeCrumbling.scale.y || 0;
        object.scale.z = node.levelNodeCrumbling.scale.z || 0;

        object.initialPosition = object.position.clone();
        object.initialRotation = object.quaternion.clone();

        let targetVector = new THREE.Vector3();
        let targetQuaternion = new THREE.Quaternion();
        let worldMatrix = new THREE.Matrix4();
        worldMatrix.compose(
            object.getWorldPosition(targetVector), 
            object.getWorldQuaternion(targetQuaternion), 
            object.getWorldScale(targetVector)
        );

        let normalMatrix = new THREE.Matrix3();
        normalMatrix.getNormalMatrix(worldMatrix);
        material.uniforms.worldNormalMatrix.value = normalMatrix;

        objects.push(object);
        
    } else if (node.levelNodeSign) {
        // object = shapes[5].clone();
        // object.material = materials[4].clone();
        object = new THREE.Mesh(shapes[5].geometry, objectMaterials[2].clone());
        parent.add(object);
        object.position.x = -node.levelNodeSign.position.x || 0;
        object.position.y = node.levelNodeSign.position.y || 0;
        object.position.z = -node.levelNodeSign.position.z || 0;
        object.quaternion.w = node.levelNodeSign.rotation.w || 0;
        object.quaternion.x = -node.levelNodeSign.rotation.x || 0;
        object.quaternion.y = node.levelNodeSign.rotation.y || 0;
        object.quaternion.z = -node.levelNodeSign.rotation.z || 0;

        const signText = node.levelNodeSign.text || "";
        const words = signText.split(" ");
        let text = "";
        for (let i = 0; i < words.length; i++) {
            if ((i + 1) % 3 == 0) {
                text += words[i] + "\n";
            } else {
                text += words[i] + " ";
            }
        }
        const fontLoader = new FontLoader();
        fontLoader.load( 'font.typeface.json', function ( response ) {

            let font = response;

            let textGeo = new TextGeometry( text, {
    
                font: font,
    
                size: 1,
                depth: -1,
                curveSegments: 4,
    
                bevelThickness: 0,
                bevelSize: 0,
                bevelEnabled: false
    
            } );
            textGeo.scale(-0.04, 0.04, 0.0000001);
            textGeo.computeBoundingBox();
            const centerOffsetX = 0.5 * ( textGeo.boundingBox.max.x - textGeo.boundingBox.min.x );
            const centerOffsetY = 0.5 * ( textGeo.boundingBox.max.y - textGeo.boundingBox.min.y );
            textGeo.translate( centerOffsetX, centerOffsetY, 0 );
            const textMesh = new THREE.Mesh( textGeo, textMaterial );
            textMesh.position.z = -0.2;

            const teleportObject = new THREE.Object3D();
            teleportObject.position.z = -1;
            object.add( teleportObject );
            let signLocation = teleportObject.getWorldPosition(new THREE.Vector3());
            signLocations.push(signLocation);
            signPositions.push(object.position.clone());

            object.add(textMesh);

        } );
        
        object.initialPosition = object.position.clone();
        object.initialRotation = object.quaternion.clone();
        
        objects.push(object);
    } else if (node.levelNodeStart) {
        // object = shapes[6].clone();
        // object.material = startMaterial;
        object = new THREE.Mesh(shapes[6].geometry, startMaterial);
        parent.add(object);
        object.position.x = -node.levelNodeStart.position.x || 0;
        object.position.y = node.levelNodeStart.position.y || 0;
        object.position.z = -node.levelNodeStart.position.z || 0;
        object.quaternion.w = node.levelNodeStart.rotation.w || 0;
        object.quaternion.x = -node.levelNodeStart.rotation.x || 0;
        object.quaternion.y = node.levelNodeStart.rotation.y || 0;
        object.quaternion.z = -node.levelNodeStart.rotation.z || 0;
        object.scale.x = node.levelNodeStart.radius || 0;
        object.scale.z = node.levelNodeStart.radius || 0;

        object.initialPosition = object.position.clone();
        object.initialRotation = object.quaternion.clone();

        objects.push(object);
        startLocation.set(object.position.x, object.position.y + playerHeight, object.position.z);
        camera.position.copy(startLocation);

    } else if (node.levelNodeFinish) {
        // object = shapes[6].clone();
        // object.material = finishMaterial;
        object = new THREE.Mesh(shapes[6].geometry, finishMaterial);
        parent.add(object);
        object.position.x = -node.levelNodeFinish.position.x || 0;
        object.position.y = node.levelNodeFinish.position.y || 0;
        object.position.z = -node.levelNodeFinish.position.z || 0;
        object.scale.x = node.levelNodeFinish.radius || 0;
        object.scale.z = node.levelNodeFinish.radius || 0;

        object.initialPosition = object.position.clone();
        object.initialRotation = object.quaternion.clone();

        objects.push(object);
        endLocation.set(object.position.x, object.position.y + playerHeight, object.position.z);
    }
    if (object !== undefined) {
        object.grabNodeData = node;
        if(node.animations && node.animations.length > 0 && node.animations[0].frames && node.animations[0].frames.length > 0) {
            for (let frame of node.animations[0].frames) {
                frame.position.x = frame.position.x || 0;
                frame.position.y = frame.position.y || 0;
                frame.position.z = frame.position.z || 0;
                frame.rotation.x = frame.rotation.x || 0;
                frame.rotation.y = frame.rotation.y || 0;
                frame.rotation.z = frame.rotation.z || 0;
                frame.rotation.w = frame.rotation.w || 0;
                frame.time = frame.time || 0;
            }
            object.animation = node.animations[0]
            object.animation.currentFrameIndex = 0
            animatedObjects.push(object)
        }
    }
}

function updateObjectAnimation(object, time) {
	let animation = object.animation
	const animationFrames = animation.frames
	const relativeTime = (time * object.animation.speed) % animationFrames[animationFrames.length - 1].time;

    if (!animation.currentFrameIndex) {
        animation.currentFrameIndex = 0;
    }
	
	let oldFrame = animationFrames[animation.currentFrameIndex];
	let newFrameIndex = animation.currentFrameIndex + 1;
	if(newFrameIndex >= animationFrames.length) newFrameIndex = 0;
	let newFrame = animationFrames[newFrameIndex];

	let loopCounter = 0;
	while(loopCounter <= animationFrames.length)
	{
		oldFrame = animationFrames[animation.currentFrameIndex];
		newFrameIndex = animation.currentFrameIndex + 1;
		if(newFrameIndex >= animationFrames.length) newFrameIndex = 0;
		newFrame = animationFrames[newFrameIndex];
		
		if(oldFrame.time <= relativeTime && newFrame.time > relativeTime) break;
		animation.currentFrameIndex += 1;
		if(animation.currentFrameIndex >= animationFrames.length - 1) animation.currentFrameIndex = 0;
		
		loopCounter += 1;
	}

	let factor = 0.0
	let timeDiff = (newFrame.time - oldFrame.time);
	if(Math.abs(timeDiff) > 0.00000001)
	{
		factor = (relativeTime - oldFrame.time) / timeDiff;
	}

	const oldRotation = new THREE.Quaternion( oldFrame.rotation.x, oldFrame.rotation.y, oldFrame.rotation.z, oldFrame.rotation.w )
	const newRotation = new THREE.Quaternion( newFrame.rotation.x, newFrame.rotation.y, newFrame.rotation.z, newFrame.rotation.w )
	const finalRotation = new THREE.Quaternion()
	finalRotation.slerpQuaternions(oldRotation, newRotation, factor)

	const oldPosition = new THREE.Vector3( oldFrame.position.x, oldFrame.position.y, oldFrame.position.z )
	const newPosition = new THREE.Vector3( newFrame.position.x, newFrame.position.y, newFrame.position.z )
	const finalPosition = new THREE.Vector3()
	finalPosition.lerpVectors(oldPosition, newPosition, factor)

	object.position.copy(object.initialPosition).add(finalPosition.applyQuaternion(object.initialRotation))
	object.quaternion.multiplyQuaternions(object.initialRotation, finalRotation)
}

function animate() {
    requestAnimationFrame( animate );

    let delta = clock.getDelta();
    
    for(let object of animatedObjects) {
        updateObjectAnimation(object, delta);
    }

	renderer.render( scene, camera );
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    
    renderer.setSize( window.innerWidth, window.innerHeight );
}

init();
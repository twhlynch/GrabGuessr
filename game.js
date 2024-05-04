import * as THREE from 'three';
import { Controls } from './Controls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const playerHeight = 1;

let camera, scene, renderer, light, sun, controls;

const velocity = new THREE.Vector3();

let spawnPoint = new THREE.Vector3(0, playerHeight, 0);
let objects = [];
let animatedObjects = [];
let loader = new GLTFLoader();
let clock = new THREE.Clock();
let isLoading = true;
let answer = undefined;
let score = 0;
let difficulty = 500;
let verifiedLevels = fetch("https://grab-tools.live/stats_data/all_verified.json").then(response => response.json());

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

let startMaterial, finishMaterial;
let materials = [];
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
const vertexShader = /*glsl*/`

varying vec3 vWorldPosition;
varying vec3 vNormal;

uniform mat3 worldNormalMatrix;

void main()
{
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;

    vNormal = worldNormalMatrix * normal;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const fragmentShader = /*glsl*/`

varying vec3 vWorldPosition;
varying vec3 vNormal;

uniform vec3 colors;
uniform float opacity;
uniform sampler2D colorTexture;
uniform float tileFactor;

const float gamma = 0.5;

void main()
{
    vec4 color = vec4(colors, opacity);
    vec3 blendNormals = abs(vNormal);
    vec3 texSample;
    vec4 adjustment = vec4(1.0, 1.0, 1.0, 1.0);

    if(blendNormals.x > blendNormals.y && blendNormals.x > blendNormals.z)
    {
        texSample = texture2D(colorTexture, vWorldPosition.zy * tileFactor).rgb;
    }
    else if(blendNormals.y > blendNormals.z)
    {
        texSample = texture2D(colorTexture, vWorldPosition.xz * tileFactor).rgb;
    }
    else
    {
        texSample = texture2D(colorTexture, vWorldPosition.xy * tileFactor).rgb;
    }

    texSample = pow(texSample, vec3(1.0 / gamma));

    color.rgb *= texSample * adjustment.rgb;
    gl_FragColor = LinearTosRGB(color);
}`;
const startFinishVS = /*glsl*/`
varying vec2 vTexcoord;

void main()
{
    vTexcoord = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const startFinishFS = /*glsl*/`
varying vec2 vTexcoord;

uniform vec4 diffuseColor;

void main()
{
    vec4 color = diffuseColor;
    float factor = vTexcoord.y;
    factor *= factor * factor;
    factor = clamp(factor, 0.0, 1.0);
    color.a = factor;

    gl_FragColor = color;
}`;


function loadTexture(path) {
    return new Promise((resolve) => {
        const texture = new THREE.TextureLoader().load(path, function (texture) {
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
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
        let material = new THREE.ShaderMaterial({
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            uniforms: {
                "colorTexture": { value: texture },
                "tileFactor": { value: 1.1 },
                "worldNormalMatrix": { value: new THREE.Matrix3() },
                "colors": { value: new THREE.Vector3(1.0, 1.0, 1.0) },
                "opacity": { value: 1.0 },
            }
        });
        materials.push(material);
    }

    for (const path of shapeList) {
        const model = await loadModel(path);
        shapes.push(model);
    }

    startMaterial = new THREE.ShaderMaterial();
	startMaterial.vertexShader = startFinishVS;
	startMaterial.fragmentShader = startFinishFS;
	startMaterial.flatShading = true;
	startMaterial.transparent = true;
	startMaterial.depthWrite = false;
	startMaterial.uniforms = { "diffuseColor": {value: [0.0, 1.0, 0.0, 1.0]}};

	finishMaterial = new THREE.ShaderMaterial();
	finishMaterial.vertexShader = startFinishVS;
	finishMaterial.fragmentShader = startFinishFS;
	finishMaterial.flatShading = true;
	finishMaterial.transparent = true;
	finishMaterial.depthWrite = false;
	finishMaterial.uniforms = { "diffuseColor": {value: [1.0, 0.0, 0.0, 1.0]}};
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

    renderer = new THREE.WebGLRenderer({alpha: true, antialias: true});
    renderer.setSize( window.innerWidth, window.innerHeight );
    document.getElementById("viewport").appendChild( renderer.domElement );
    renderer.setPixelRatio(window.devicePixelRatio);

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 5000 );
    camera.position.set( 0, playerHeight, 0 );

    light = new THREE.AmbientLight(0xffffff);
    scene.add(light);
    sun = new THREE.DirectionalLight( 0xffffff, 0.5 );
    scene.add( sun );

    controls = new Controls( camera, renderer.domElement );
    scene.add( controls.getObject() );

    window.addEventListener( 'resize', onWindowResize );

    let randomButton = document.getElementById("randomButton");
    
    randomButton.addEventListener( 'click', () => {
        score -= 1;
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
        const downloadUrl = `https://api.slin.dev/grab/v1/download/${randomLevel.data_key.replace("level_data:", "").split(":").join("/")}`;
        let level =  await openProto(downloadUrl);
        await loadLevel(level);
    });
}

function displayScore() {
    document.getElementById("score").innerText = `Score: ${score}`;
}

function guess(identifier) {
    if (identifier == answer) {
        if (difficulty == 100) {score += 1;}
        if (difficulty == 500) {score += 5;}
        if (difficulty == 3000) {score += 10;}
        if (difficulty == 9999999) {score += 20;}
    } else {
        score -= 1;
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

async function loadSearch() {
    const query = document.getElementById("search").value;
    document.getElementById("cards").innerHTML = "";
    verifiedLevels.then(levels => {
        let results = levels.filter(l => (
            l.title.toLowerCase().replace(" ", "").includes(query.toLowerCase().replace(" ", "")) ||
            (l?.creators || []).toString().toLowerCase().replace(" ", "").includes(query.toLowerCase().replace(" ", ""))
        ));
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

    velocity.x = 0;
    velocity.y = 0;
    velocity.z = 0;
    
    scene.add(light);
    scene.add(sun);
    scene.add(camera);

    level.levelNodes.forEach(node => {
        loadLevelNode(node, scene);
    });

    let ambience = level.ambienceSettings;
    let sky = [
        [0, 0, 0],
        [0, 0, 0]
    ];
    
    if (ambience) {
        if (ambience.skyZenithColor) {
            sky[0][0] = (ambience?.skyZenithColor?.r || 0) * 255;
            sky[0][1] = (ambience?.skyZenithColor?.g || 0) * 255;
            sky[0][2] = (ambience?.skyZenithColor?.b || 0) * 255;
        }
        if (ambience.skyHorizonColor) {
            sky[1][0] = (ambience?.skyHorizonColor?.r || 0) * 255;
            sky[1][1] = (ambience?.skyHorizonColor?.g || 0) * 255;
            sky[1][2] = (ambience?.skyHorizonColor?.b || 0) * 255;
        }
    }

    document.body.style.backgroundImage = `linear-gradient(rgb(${sky[0][0]}, ${sky[0][1]}, ${sky[0][2]}), rgb(${sky[1][0]}, ${sky[1][1]}, ${sky[1][2]}), rgb(${sky[0][0]}, ${sky[0][1]}, ${sky[0][2]}))`;
    
    console.log(level);
    console.log(objects);
    console.log(scene);
    isLoading = false;
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
            node.levelNodeStatic.color.r ? null : node.levelNodeStatic.color.r = 0;
            node.levelNodeStatic.color.g ? null : node.levelNodeStatic.color.g = 0;
            node.levelNodeStatic.color.b ? null : node.levelNodeStatic.color.b = 0;
            material.uniforms.colors.value = new THREE.Vector3(node.levelNodeStatic.color.r, node.levelNodeStatic.color.g, node.levelNodeStatic.color.b);
            if (node.levelNodeStatic.isNeon) {
                //
            }
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
        object = new THREE.Mesh(shapes[5].geometry, materials[4]);
        parent.add(object);
        object.position.x = -node.levelNodeSign.position.x || 0;
        object.position.y = node.levelNodeSign.position.y || 0;
        object.position.z = -node.levelNodeSign.position.z || 0;
        object.quaternion.w = node.levelNodeSign.rotation.w || 0;
        object.quaternion.x = -node.levelNodeSign.rotation.x || 0;
        object.quaternion.y = node.levelNodeSign.rotation.y || 0;
        object.quaternion.z = -node.levelNodeSign.rotation.z || 0;
        
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
        camera.position.set(object.position.x, object.position.y + playerHeight, object.position.z);
        spawnPoint.set(object.position.x, object.position.y + playerHeight, object.position.z);

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
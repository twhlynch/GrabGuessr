import {
	Euler,
	EventDispatcher
} from 'three';

const _euler = new Euler( 0, 0, 0, 'YXZ' );
const _PI_2 = Math.PI / 2;

class Controls extends EventDispatcher {

	constructor( camera, domElement ) {

		super();

		this.camera = camera;
		this.domElement = domElement;

		this.isActive = false;

		this.minPolarAngle = 0;
		this.maxPolarAngle = Math.PI;

		this.pointerSpeed = Math.PI;

		this._onMouseMove = onMouseMove.bind( this );
		this._onTouchMove = onTouchMove.bind( this );

		this._onMouseDown = onDown.bind( this );
		this._onTouchStart = onDown.bind( this );
		this._onMouseUp = onUp.bind( this );
		this._onTouchEnd = onUp.bind( this );

		this.connect();

	}

	connect() {

		this.domElement.ownerDocument.addEventListener( 'mousemove', this._onMouseMove );
		this.domElement.ownerDocument.addEventListener( 'touchmove', this._onTouchMove );
		this.domElement.addEventListener('mousedown', this._onMouseDown );
		this.domElement.addEventListener('touchstart', this._onTouchStart );
		this.domElement.ownerDocument.addEventListener('mouseup', this._onMouseUp );
		this.domElement.ownerDocument.addEventListener('touchend', this._onTouchEnd );

	}

	disconnect() {

		this.domElement.ownerDocument.removeEventListener( 'mousemove', this._onMouseMove );
		this.domElement.ownerDocument.removeEventListener( 'touchmove', this._onTouchMove );
		this.domElement.removeEventListener('mousedown', this._onMouseDown );
		this.domElement.removeEventListener('touchstart', this._onTouchStart );
		this.domElement.ownerDocument.removeEventListener('mouseup', this._onMouseUp );
		this.domElement.ownerDocument.removeEventListener('touchend', this._onTouchEnd );

	}

	dispose() {

		this.disconnect();

	}

	getObject() {

		return this.camera;

	}

	getDirection( v ) {

		return v.set( 0, 0, - 1 ).applyQuaternion( this.camera.quaternion );

	}

}

function onDown() {

	this.touchStartX = event.touches ? event.touches[ 0 ].clientX : event.clientX;
	this.touchStartY = event.touches ? event.touches[ 0 ].clientY : event.clientY;
	this.isActive = true;

}

function onUp() {
	
	this.isActive = false;

}

function onMouseMove( event ) {

	if ( this.isActive === false ) return;

	const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
	const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

	const camera = this.camera;
	_euler.setFromQuaternion( camera.quaternion );

	_euler.y -= movementX * 0.002 * this.pointerSpeed;
	_euler.x -= movementY * 0.002 * this.pointerSpeed;

	_euler.x = Math.max( _PI_2 - this.maxPolarAngle, Math.min( _PI_2 - this.minPolarAngle, _euler.x ) );

	camera.quaternion.setFromEuler( _euler );

}

function onTouchMove( event ) {

	if ( this.isActive === false ) return;

	const touch = event.touches[ 0 ];

	const deltaX = touch.clientX - this.touchStartX;
	const deltaY = touch.clientY - this.touchStartY;

	this.touchStartX = touch.clientX;
	this.touchStartY = touch.clientY;

	const camera = this.camera;
	_euler.setFromQuaternion( camera.quaternion );

	_euler.y -= deltaX * 0.002 * this.pointerSpeed;
	_euler.x -= deltaY * 0.002 * this.pointerSpeed;

	_euler.x = Math.max( _PI_2 - this.maxPolarAngle, Math.min( _PI_2 - this.minPolarAngle, _euler.x ) );

	camera.quaternion.setFromEuler( _euler );

}

export { Controls };

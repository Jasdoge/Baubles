import Program from './Program.js';
const SERVICE_UUID = 'dea7f73c-723c-4ba2-b769-9c0f43293653';

const BTCH_PROGRAM = "d7b710fb-74d5-4413-a94d-38e387e55745";
const BTCH_KEY = "d7b710fb-74d5-4413-a94d-38e387e55746";

const soundkits = [
	{name:'Piano', val:'octaves_piano'},
	{name:'Guitar', val:'octaves_guitar'},
	{name:'Bell', val:'octaves_bell'},
];


export default class App{

	constructor(){
		
		this.content = $("#content");
		this.bleConnect = $("#connect");
		this.settings = $("#settings");
		this.viewer = $("#viewer");
		this.back = $("#back");
		this.modal = $("#modal");

		this.connected = false;
		this.service = null;
		this.ch_program = null;
		this.ch_key = null;
		this.device = null;
		this.retries = 0;
		this.active_program = 1;
		this.soundKit = localStorage.soundKit;

		

		this.bleConnect.on('click', async () => {
			try{
				const device = await navigator.bluetooth.requestDevice({ 
					filters: [{ services: [SERVICE_UUID] }] 
				});
				this.device = device;
				device.addEventListener('gattserverdisconnected', () => this.onDisconnect());
				this.connect();
			}catch(err){
				console.error(err);
			}
		});

		$(window).on('resize', () => {
			this.camera.aspect = window.innerWidth / window.innerHeight;
			this.camera.updateProjectionMatrix();
			this.renderer.setSize(window.innerWidth, window.innerHeight);
		});


		this.scene = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.1, 1000 );
		this.camera.position.z = 4.5;
		this.camera.position.y = -0.5;
		this.camera.lookAt(new THREE.Vector3(0,0,0));
		//this.camera.target.position.y = 3;
		this.renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
		this.renderer.setSize( window.innerWidth, window.innerHeight );
		this.viewer.append( this.renderer.domElement );
		this.clock = new THREE.Clock();


		const light = new THREE.DirectionalLight(0xFFFFFF, 0.8);
		this.light = light;
		light.position.x = light.position.y = 2;
		light.position.z = 5;
		this.scene.add(light);

		const ambient = new THREE.AmbientLight(0xFFFFFF, 0.4); 
		this.scene.add(ambient);

		this.raycaster = new THREE.Raycaster();
		
		this.textureLoader = new THREE.TextureLoader();
		this.snowParticleTexture = this.textureLoader.load('./media/snowflake.png');
		this.notesPlayedTimeout = null;
		this.snowParticles = null;
		this.snowParticlesEmitter = null;

		this.buildGeometry();
		this.render();

		




		this.loadSounds();

		this.settings.on('click', () => this.drawSettings());
		this.back.on('click', () => this.closeSettings());

		// Caches num keys hit since last
		this.keys_hit = 0;
		setInterval(() => this.keyTick(), 100);
		this.tick_wait = false;


		// uuid:obj
		this.held_keys = {};
		$(this.renderer.domElement).on('touchstart touchmove', event => {
			if( event.type === 'touchstart' || event.type === 'touchmove' )
				this.onTouch(event.targetTouches);
			else
				this.onTouch([event]);
			return false;
		});
		$(this.renderer.domElement).on('touchend', event => {
			// Reset touches
			if( !event.targetTouches.length )
				this.onTouch([]);
		});
		/*
		this.renderer.domElement.addEventListener('mousedown', event => {
			this.onTouch(event);
			return false;
		});
		*/

	}

	loadSounds(){

		if( !this.soundKit )
			this.soundKit = 'octaves_piano';

		localStorage.soundKit = this.soundKit;
		
		let intervals = {};
		for( let i=0; i<(7+5)*4; ++i)
			intervals['s'+i] = [i*4000, 3999];
		this.sounds = new Howl({
			volume : 0.5,
			src: ['media/'+this.soundKit+'.ogg'],
			sprite: intervals
		});

	}

	async connect(){
		try{
			this.bleConnect.html('Connecting...');
			const server = await this.device.gatt.connect();
			this.service = await server.getPrimaryService(SERVICE_UUID);
			this.ch_program = await this.service.getCharacteristic(BTCH_PROGRAM);
			this.ch_key = await this.service.getCharacteristic(BTCH_KEY);

			const ch = await this.ch_program.readValue();
			this.active_program = ch.getUint8(0);
			console.log("Active program", this.active_program);
			this.onConnect();
		}catch(err){
			console.error(err);
			console.log("Reconnect attempt ", this.retries, "failed");
		}
	}

	async onDisconnect(){
		this.bleConnect.html('Connect To Baubles');
		if( this.device && this.retries < 3 ){
			console.log("Disconnected, reconnecting");
			setTimeout(() => this.connect(), 3000*this.retries);
			++this.retries;
			return;
		}
		this.content.toggleClass("connected", false);
		this.connected = false;
	}

	onConnect(){
		console.log("Connected");
		this.retries = 0;
		this.connected = true;
		this.tick_wait = false;
		this.content.toggleClass("connected", true);
	}

	setProgram( program = 1 ){
		if( !this.connected )
			return false;
		const ch = Uint8Array.of(program);
		return this.ch_program.writeValue(ch);
	}

	async keyHit( numKeys = 1 ){

		if( !this.connected )
			return false;
		this.tick_wait = true;
		const ch = Uint8Array.of(numKeys);
		try{
			await this.ch_key.writeValue(ch);
		}catch(err){
			console.error(err);
		}
		this.tick_wait = false;

	}

	// Ticker that groups key hits together
	keyTick(){
		
		if( !this.keys_hit || this.tick_wait )
			return;
		
		this.keyHit(this.keys_hit);
		this.keys_hit = 0;

	}






	// audio
	onTouch( events ){

		clearTimeout(this.notesPlayedTimeout);
		this.snowParticlesEmitter.disable();
		this.notesPlayedTimeout = setTimeout(() => {
			this.snowParticlesEmitter.enable();
		}, 6000);

		const heldKeys = {};	// uuid:true
		for( let event of events ){

			const mouse = new THREE.Vector2();
			mouse.x = ( event.clientX / window.innerWidth ) * 2 - 1;
			mouse.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
			this.raycaster.setFromCamera( mouse, this.camera );

			const intersects = this.raycaster.intersectObjects( this.keysGroup.children ).filter(
				el => el.object.name === "key"
			);

			

			const obj = intersects.shift();
			if( !obj )
				continue;

			const mesh = obj.object;
			heldKeys[mesh.uuid] = mesh;
			// This key is already held
			if( this.held_keys[mesh.uuid] )
				continue;


			this.spawnKeyParts(obj);
			

			const ud = mesh.userData;
			const mat = mesh.material;
			const black = ud.black;
			let sounds = this.sounds;
			
			clearInterval(ud.fade);
			if( !black )
				mat.color.b = mat.color.r = 0.5;
			else
				mat.color.g = 0.5;
			ud.playingSound = sounds.play('s'+ud.index);

			++this.keys_hit;
			
			
		}

		for( let i in this.held_keys ){
			if( !heldKeys[i] )
				this.held_keys[i].userData.startFade();
		}

		this.held_keys = heldKeys;

	}





	// 3d
	render(){
		const delta = this.clock.getDelta();
		requestAnimationFrame( () => this.render() );
		this.renderer.render( this.scene, this.camera );
		this.snowParticles.tick(delta);
		this.sparkleParticles.tick(delta);
		this.sparkleBoostParticles.tick(delta);
	}

	// Builds the piano
	buildGeometry(){

		const group = new THREE.Group();
		const addFadeFunction = mesh => {
			const userData = mesh.userData;
			const mat = mesh.material;
			userData.startFade = () => {
				userData.playingSound = this.sounds.fade(this.sounds._volume, 0.0001, 1500, userData.playingSound);
				userData.fade = setInterval(() => {
					const amt = 1.0/60.0
					if( userData.black ){
						mat.color.g -= amt;
						if( mat.color.g <= 0.1 ){
							mat.color.g = 0.1;
							clearInterval(userData.fade);
						}
					}
					else{
						mat.color.r += amt;
						if( mat.color.r >= 0.9 ){
							mat.color.r = 0.9;
							clearInterval(userData.fade);
						}
						mat.color.b = mat.color.r;
					}
				}, 17);
			};
		};

		const numWhiteKeys = 7*4;
		const width = 0.42;
		const geo = new THREE.BoxGeometry(width,width*4,width/2);
		const blackgeo = new THREE.BoxGeometry(width*.75, width*2.5, width/2);
		let keyIndex = 0;
		for( let i=0; i<numWhiteKeys; ++i ){

			let material = new THREE.MeshStandardMaterial( { color: new THREE.Color(0.9,0.9,0.9), metalness:0.3, roughness:0.6 } );
			const key = new THREE.Mesh(geo, material);
			group.add(key);
			let o = i;
			key.position.y = width*4/2-width*4; 
			if( i >= numWhiteKeys/2 ){
				o = i-numWhiteKeys/2;
				key.position.y = width*4/2;
				key.position.z = width/2;
			}
			key.userData.index = keyIndex++;
			key.name = 'key';
			key.userData.black = false;
			const offs = width+0.02;
			key.position.x = -numWhiteKeys/4*offs+offs/2+offs*o;
			addFadeFunction(key);

			// Black one
			if( ~[0,1,3,4,5].indexOf(i%7) ){

				material = new THREE.MeshStandardMaterial({
					color: new THREE.Color(0.1,0.1,0.1), 
					metalness:0.3, 
					roughness:0.4
				});
				const black = new THREE.Mesh(blackgeo, material);
				black.position.x = key.position.x+width*.55;
				black.position.y = key.position.y+width*.75;
				black.position.z = key.position.z+0.1;
				black.userData.index = keyIndex++;
				black.name = 'key';
				black.userData.black = true;
				addFadeFunction(black);
				group.add(black);

			}
			
		}

		this.keysGroup = group;
		this.scene.add(group);

		// Particles

		this.snowParticles = new SPE.Group({
			texture: {
				value: this.snowParticleTexture
			},
			blending : THREE.NormalBlending,
			maxParticleCount:500
		});
		const emitter = new SPE.Emitter({
			maxAge: {
				value: 4
			},
			wiggle : {
				value : 0,
				spread : 3,
			},
			rotation : {
				angleSpread : 0.3,
				axisSpread : Math.PI*2
			},
			opacity : {
				value : [0,1,0]
			},
			position: {
				value: new THREE.Vector3(0, 0, this.camera.position.z-2),
				spread: new THREE.Vector3( 10, 10, 0 ),
				randomise : true,
			},
			acceleration: {
				value: new THREE.Vector3(0, 0, 0),
				spread: new THREE.Vector3( 0, 0, 0 ),
				randomise : true,

			},
			velocity: {
				value: new THREE.Vector3(0, 0, -0.5),
				spread: new THREE.Vector3(0, 0, 0),
				randomise : true,

			},
			angle : {
				spread : Math.PI*2,
				randomise : true,
			},
			color: {
				value: [ new THREE.Color('white') ]
			},
			size: {
				value: [0.2,0.05]
			},
			particleCount: 200
		});
		this.snowParticlesEmitter = emitter;
		this.snowParticles.addEmitter( emitter );
		this.scene.add( this.snowParticles.mesh );




		// Group for sparkles

		this.sparkleParticles = new SPE.Group({
			texture: {
				value: this.textureLoader.load('./media/sparkle.png')
			},
			blending : THREE.AdditiveBlending,
			maxParticleCount:5000
		});
		this.sparkleBoostParticles = new SPE.Group({
			texture: {
				value: this.textureLoader.load('./media/snowflake.png')
			},
			blending : THREE.AdditiveBlending,
			maxParticleCount:5000
		});
		this.scene.add(this.sparkleParticles.mesh);
		this.scene.add(this.sparkleBoostParticles.mesh);
		
		this.sparkleParticles.active_emitter = 0;
		for( let i =0; i<50; ++i){
			const sparkles = new SPE.Emitter({
				maxAge: {
					value: 0.25
				},
				type : SPE.distributions.BOX,
				opacity : {
					value : [0,1]
				},
				position: {
					value: new THREE.Vector3(0,0,2),
					spread: new THREE.Vector3( 0, 0, 0 ),
					randomise : true,
				},
				acceleration: {
					value: new THREE.Vector3(0, 0, 0),
					//spread: new THREE.Vector3( 4, 4, 0 ),
					randomise : true,
				},
				velocity: {
					value: new THREE.Vector3(0, 0, 1),
					spread: new THREE.Vector3(5, 5, 0),
					//randomise : true,
				},
				color: {
					value: [ new THREE.Color(1.0,1.0,0.0) ]
				},
				size: {
					value: [0.6,0.2]
				},
				particleCount: 20
			});
			const sparklesBoost = new SPE.Emitter({
				maxAge: {
					value: 0.75
				},
				type : SPE.distributions.BOX,
				opacity : {
					value : [0,1,0]
				},
				position: {
					value: new THREE.Vector3(0,0,2),
					spread: new THREE.Vector3( 0.3, 0.3, 0.3 ),
					randomise : true,
				},
				acceleration: {
					value: new THREE.Vector3(0, 0, 0),
					//spread: new THREE.Vector3( 4, 4, 0 ),
					randomise : true,
				},
				velocity: {
					value: new THREE.Vector3(0, 0, 0),
					spread: new THREE.Vector3(1, 1, 1),
					//randomise : true,
				},
				color: {
					value: [ new THREE.Color(0,1.0,0.0), new THREE.Color(0xFFFFFF) ]
				},
				size: {
					value: [0.3,0.1]
				},
				particleCount: 10
			});
			sparkles.disable();
			sparklesBoost.disable();
			this.sparkleParticles.addEmitter(sparkles);
			this.sparkleBoostParticles.addEmitter(sparklesBoost);
		}
		
	}

	spawnKeyParts( raycastObj ){

		if( ++this.sparkleParticles.active_emitter >= 50 )
			this.sparkleParticles.active_emitter = 0;
		const emitter = this.sparkleParticles.emitters[this.sparkleParticles.active_emitter];
		const boost = this.sparkleBoostParticles.emitters[this.sparkleParticles.active_emitter];
		emitter.position.value = emitter.position.value.set(raycastObj.point.x,raycastObj.point.y,raycastObj.point.z+0.1);
		boost.position.value = boost.position.value.set(raycastObj.point.x,raycastObj.point.y,raycastObj.point.z+0.1);
		
		clearTimeout(emitter.timerDisable);
		emitter.reset(true);
		boost.reset(true);
		emitter.enable();
		boost.enable();
		emitter.timerDisable = setTimeout(() => {
			emitter.disable();
			boost.disable();
		}, 100);

		

	}
	


	// Settings
	drawSettings(){

		const updateLabels = () => {
			$("label").toggleClass('active', false);
			$("input[type=radio]:checked").parent().toggleClass('active', true);
		}

		let active = Program.getByIndex(this.active_program);
		
		let html = '<div class="flexTwoCol">';
		
			html += '<div class="flexLeft">';
				html += '<h2>Program</h2>';
			for( let program of Program.lib )
				html += '<label><input type="radio" name="program" value="'+program.index+'" '+(program.index === active.index ? 'checked' : '')+' /> '+program.name+'</label>';
			
			html += '</div>';

			html += '<div class="flexRight" style="text-align:right">';
				html += '<h2>Sounds</h2>';
			for( let sound of soundkits )
				html += '<label>'+sound.name+' <input type="radio" name="soundkit" value="'+sound.val+'" '+(sound.val === this.soundKit ? 'checked' : '')+' /></label>';		
			html += '</div>';
		
		html += '</div>';

		this.content.toggleClass("modal", true);
		this.modal.html(html);

		updateLabels();
		const th = this;
		$("input[name=program]").on('change', function(){
			th.setProgram(+$(this).val());
			updateLabels();
		});
		$("input[name=soundkit]").on('change', function(){
			th.soundKit = $(this).val();
			th.loadSounds();
			updateLabels();
		});
	}

	closeSettings(){
		this.content.toggleClass("modal", false);
	}


}

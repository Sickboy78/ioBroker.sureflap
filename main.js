/***********************
 *                     *
 *  Sure Flap Adapter  *
 *                     *
 ***********************/

'use strict';

/*
 * Created with @iobroker/create-adapter v1.31.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
// const fs = require("fs");
const https = require('https');
const util = require('util');

// Constants
const DEVICE_TYPE_PET_FLAP = 3;
const DEVICE_TYPE_FEEDER = 4;
const DEVICE_TYPE_CAT_FLAP = 6;

class Sureflap extends utils.Adapter {

	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'sureflap',
		});

		// class variables

		// number of logins
		this.numberOfLogins = 0;
		// timer id
		this.timerId = 0;
		// is first update loop
		this.firstLoop = true;
		// current state
		this.sureFlapState = {};
		// previous state
		this.sureFlapStatePrev = {};

		// promisify setObjectNotExists
		this.setObjectNotExistsPromise = util.promisify(this.setObjectNotExists);

		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		// this.on("objectChange", this.onObjectChange.bind(this));
		// this.on("message", this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here

		// Reset the connection indicator during startup
		this.setConnectionStatusToAdapter(false);

		// The adapters config (in the instance object everything under the attribute "native") is accessible via
		// this.config:
		//this.log.info("config option1: " + this.config.option1);
		//this.log.info("config option2: " + this.config.option2);

		// In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
		// You can also add a subscription for multiple states. The following line watches all states starting with "lights."
		// this.subscribeStates("lights.*");
		// Or, if you really must, you can also watch all states. Don't do this if you don't need to. Otherwise this will cause a lot of unnecessary load on the system:
		// this.subscribeStates("*");
		this.subscribeStates('*');

		// start loading the data from the surepetcare API
		this.startLoadingData();
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			clearTimeout(this.timerId);
			this.setConnectionStatusToAdapter(false);
			this.log.info(`everything cleaned up`);
		} catch (e) {
			this.log.warn(`adapter clean up failed: ${e}`);
		} finally {
			callback();
		}
	}

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  * @param {string} id
	//  * @param {ioBroker.Object | null | undefined} obj
	//  */
	// onObjectChange(id, obj) {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		// The object was deleted
	// 		this.log.info(`object ${id} deleted`);
	// 	}
	// }

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		// desired value is set
		if(id && state && state.ack === false) {
			const l = id.split('.');
			if ((l.length > 5) && l[l.length - 2] == 'control') {
				// change in control section
				const hierarchy = l.slice(2,l.length-2).join('.');
				const device = l[4];
				const control = l[l.length - 1];

				if(control === 'curfew') {
					this.changeCurfew(hierarchy, device, state.val === true);
				} else if(typeof(state.val) === 'number') {
					this.changeLockmode(hierarchy, device, state.val);
				}
				return;
			} else if((l.length > 4) && l[l.length - 3] == 'pets' && l[l.length - 1] == 'inside') {
				// change of pet location
				const hierarchy = l.slice(2,l.length-3).join('.');
				const pet = l[l.length-2];
				this.changePetLocation(hierarchy, pet, state.val === true);
				return;
			} else {
				// TODO implement changing curfew times
				this.log.warn(`not allowed to change object ${id}`);
				return;
			}
		}
	}

	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === "object" && obj.message) {
	// 		if (obj.command === "send") {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info("send command");

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
	// 		}
	// 	}
	// }

	/*************************************************
	 * methods to start and keep update loop running *
	 *************************************************/

	/**
	 * starts loading data from the surepet API
	 */
	startLoadingData() {
		clearTimeout(this.timerId);
		this.doAuthenticate()
			.then(() => this.getHouseholdFromApi())
			.then(() => this.startUpdateLoop())
			.catch(error => {
				this.log.error(error);
				this.log.info(`disconnected`);
				// @ts-ignore
				this.timerId = setTimeout(this.startLoadingData.bind(this), 10*1000);
			});
	}

	/**
	 * does the authentication with the surepetcare API
	 * @return {Promise}
	 */
	doAuthenticate() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			this.setConnectionStatusToAdapter(false);
			this.doLoginViaApi().then(token => {
				this.sureFlapState['token'] = token;
				this.setConnectionStatusToAdapter(true);
				this.log.info(`connected`);
				return resolve();
			}).catch(error => {
				return reject(error);
			});
		}));
	}

	/**
	 * starts the update loop
	 * @return {Promise}
	 */
	startUpdateLoop() {
		return /** @type {Promise<void>} */(new Promise((resolve) => {
			this.log.info(`starting update loop...`);
			this.firstLoop=true;
			this.updateLoop();
			this.log.info(`update loop started`);
			return resolve();
		}));
	}

	/**
	 * the update loop, refreshing the data every 10 seconds
	 */
	updateLoop() {
		clearTimeout(this.timerId);
		this.getDataFromApi()
			.then(() => this.createAdapterObjectHierarchy())
			.then(() => this.getStatus())
			.then(() => this.getPets())
			.then(() => this.setUpdateTimer())
			.catch(error => {
				this.log.error(error);
				this.log.info(`loop stopped`);
				this.log.info(`disconnected`);
				// @ts-ignore
				this.timerId = setTimeout(this.startLoadingData.bind(this), 10*1000);
			})
			.finally(() => {this.firstLoop=false;});
	}

	/**
	 * sets the update timer
	 * @return {Promise}
	 */
	setUpdateTimer() {
		return /** @type {Promise<void>} */(new Promise((resolve) => {
			// @ts-ignore
			this.timerId = setTimeout(this.updateLoop.bind(this), 10*1000);
			return resolve();
		}));
	}

	/***********************************************
	 * methods to communicate with surepetcare API *
	 ***********************************************/

	/**
	 * does a login via the surepet API
	 * @return {Promise} Promise of an auth token
	 */
	doLoginViaApi() {
		return new Promise((resolve, reject) => {
			const postData = JSON.stringify( this.buildLoginJsonData() );
			const options = this.buildOptions('/api/auth/login', 'POST', '');
			this.sureFlapState = {};
			this.numberOfLogins++;
			this.log.info(`connecting...`);
			this.log.debug(`email_address: ${this.buildLoginJsonData().email_address}`);
			this.log.debug(`password: ${this.buildLoginJsonData().password}`);
			this.log.debug(`json: ${postData}`);
			this.log.debug(`login count: ${this.numberOfLogins}`);
			this.httpRequest('login', options, postData).then(result => {
				if (result == undefined || result.data == undefined || !('token' in result.data)) {
					return reject(new Error(`login failed. possible wrong login or pwd? retrying in 10 seconds`));
				} else {
					this.numberOfLogins = 0;
					return resolve(result.data['token']);
				}
			}).catch(error => {
				return reject(error);
			});
		});
	}

	/**
	 * gets the households from surepet API
	 * @return {Promise}
	 */
	getHouseholdFromApi() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const options = this.buildOptions('/api/household?with[]=household', 'GET', this.sureFlapState['token']);
			this.log.info(`reading households...`);
			this.httpRequest('get_household', options, '').then(result => {
				if (result == undefined || result.data == undefined) {
					return reject(new Error(`getting household failed. retrying login in 10 seconds`));
				} else {
					this.sureFlapState['household'] = result.data[0]['id'];
					this.log.info(`households read`);
					return resolve();
				}
			}).catch(error => {
				return reject(error);
			});
		}));
	}

	/**
	 * gets the data from surepet API
	 * @return {Promise}
	 */
	getDataFromApi() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const options = this.buildOptions('/api/me/start', 'GET', this.sureFlapState['token']);
			this.httpRequest('get_control', options, '').then(result => {
				if (result == undefined || result.data == undefined) {
					return reject(new Error(`getting data failed. retrying login in 10 seconds`));
				} else {
					this.sureFlapStatePrev = JSON.parse(JSON.stringify(this.sureFlapState));
					this.sureFlapState.devices = result.data.devices;
					this.sureFlapState.households = result.data.households;
					this.sureFlapState.pets = result.data.pets;
					this.makeNamesCanonical();
					this.makeCurfewArray();
					this.normalizeLockMode();
					this.setOfflineDevices();
					return resolve();
				}
			}).catch(error => {
				return reject(error);
			});

		}));
	}

	/*******************************************************************
	 * methods to get information from the response of the surepet API *
	 *******************************************************************/

	/**
	 * gets the status from surepet state object
	 * @return {Promise}
	 */
	getStatus() {
		return /** @type {Promise<void>} */(new Promise((resolve) => {
			this.setGlobalOnlineStatusToAdapter();

			for(let h = 0; h < this.sureFlapState.households.length; h++) {
				const prefix = this.sureFlapState.households[h].name;

				for(let d = 0; d < this.sureFlapState.devices.length; d++) {
					if (this.sureFlapState.devices[d].household_id ==  this.sureFlapState.households[h].id) {
						if ('parent' in this.sureFlapState.devices[d]) {
							const hierarchy = '.' + this.sureFlapState.devices[d].parent.name;

							if (this.sureFlapState.devices[d].product_id == DEVICE_TYPE_PET_FLAP || this.sureFlapState.devices[d].product_id == DEVICE_TYPE_CAT_FLAP) {
								// Sureflap Connect
								this.setSureflapConnectToAdapter(prefix,hierarchy,d);
							} else if (this.sureFlapState.devices[d].product_id == DEVICE_TYPE_FEEDER) {
								// Feeding Bowl Connect currently not supported
								// TODO: implement
							}
							this.setBatteryStatusToAdapter(prefix,hierarchy,d);
						} else {
							this.setHubStatusToAdapter(prefix,d);
						}
						this.setOnlineStatusToAdapter(prefix,d);
					}
				}
			}
			return resolve();
		}));
	}

	/**
	 * gets the pets from surepet state object
	 * @return {Promise}
	 */
	getPets() {
		return /** @type {Promise<void>} */(new Promise((resolve) => {
			const numPets = this.sureFlapState.pets.length;

			for (let i = 0; i < numPets; i++) {
				const name = this.sureFlapState.pets[i].name;
				const where = this.sureFlapState.pets[i].position.where;
				const since = this.sureFlapState.pets[i].position.since;
				const household_name = this.getHouseholdNameForId(this.sureFlapState.pets[i].household_id);
				const prefix = household_name + '.pets';

				this.setPetStatusToAdapter(prefix, name, where, since, i);
			}
			return resolve();
		}));
	}

	/********************************************
	 * methods to set values to the surepet API *
	 ********************************************/

	/**
	 * changes the lockmode
	 * @param {string} hierarchy
	 * @param {string} device
	 * @param {number} value
	 */
	changeLockmode(hierarchy, device, value) {
		if(value < 0 || value > 3) {
			this.log.warn(`invalid value for lock mode: ${value}`);
			this.resetControlLockmodeToAdapter(hierarchy, device);
			return;
		}

		this.log.debug(`changing lock mode to ${value}...`);
		this.setLockmode(device, value)
			.then(() => {
				this.log.info(`lock mode changed to ${value}`);
			}).catch(err => {
				this.log.error(`changing lock mode failed: ${err}`);
				this.resetControlLockmodeToAdapter(hierarchy, device);
			});
	}

	/**
	 * switches the curfew on or off
	 * @param {string} hierarchy
	 * @param {string} device
	 * @param {boolean} value
	 */
	changeCurfew(hierarchy, device, value) {
		let current_state = false;
		const device_type = this.getDeviceType(device);
		const curfew_settings = hierarchy + '.curfew';
		this.getCurfewFromAdapter(curfew_settings).then(curfew => {
			current_state = this.isCurfewEnabled(curfew);
		}).finally(() => {
			this.log.debug(`control curfew old state: ${current_state} new state: ${value}`);
			if(current_state !== value) {
				if(value === true) {
					// enable curfew
					const obj_name =  hierarchy + '.last_curfew';
					this.getCurfewFromAdapter(obj_name).then(curfew => {
						if(curfew.length > 0) {
							if(DEVICE_TYPE_PET_FLAP === device_type) {
								// pet flap takes single object instead of array
								curfew = curfew[0];
								curfew.enabled = true;
							}
							const curfewJSON = JSON.stringify(curfew);
							this.log.debug(`setting curfew to: ${curfewJSON}`);
							this.setCurfew(device,curfew).then(() => {
								this.log.info(`curfew succesfully enabled`);
							}).catch(err => {
								this.log.error(`could not enable curfew because: ${err}`);
								this.resetControlCurfewToAdapter(hierarchy, device);
							});
						} else {
							this.log.error(`could not enable curfew because: last_curfew does not contain a curfew`);
							this.resetControlCurfewToAdapter(hierarchy, device);
						}
					}).catch(err => {
						this.log.error(`could not enable curfew because: ${err}`);
						this.resetControlCurfewToAdapter(hierarchy, device);
					});
				} else {
					// disable curfew
					const obj_name =  hierarchy + '.curfew';
					this.getCurfewFromAdapter(obj_name).then(curfew => {
						for(let h = 0; h < curfew.length; h++) {
							curfew[h].enabled = false;
						}
						if(DEVICE_TYPE_PET_FLAP === device_type) {
							// pet flap takes single object instead of array
							curfew = curfew[0];
						}
						this.log.debug('setting curfew to: ' + JSON.stringify(curfew));
						this.setCurfew(device,curfew).then(() => {
							this.log.info(`curfew succesfully disabled`);
						}).catch(err => {
							this.log.error(`could not disable curfew because: ${err}`);
							this.resetControlCurfewToAdapter(hierarchy, device);
						});
					}).catch(err => {
						this.log.error(`could not disable curfew because: ${err}`);
						this.resetControlCurfewToAdapter(hierarchy, device);
					});
				}
			}
		});
	}

	/**
	 * changes the pet location
	 * @param {string} hierarchy
	 * @param {string} pet
	 * @param {boolean} value
	 */
	changePetLocation(hierarchy, pet, value) {
		this.getStateValueFromAdapter(hierarchy + '.pets.' + pet + '.name').then(name => {
			this.setPetLocation(hierarchy, name, value).then(() => {
				this.log.info(`pet location succesfully set`);
			}).catch(error => {
				this.log.error(`could not set pet location because: ${error}`);
				this.resetPetInsideToAdapter(hierarchy, pet);
			});
		}).catch(error => {
			this.log.error(`could not set pet location because: ${error}`);
			this.resetPetInsideToAdapter(hierarchy, pet);
		});
	}

	/**
	 * sets the lockmode
	 * @param {string} device
	 * @param {number} lockmode
	 * @return {Promise}
	 */
	setLockmode(device, lockmode) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const device_id = this.getDeviceId(device);
			const postData = JSON.stringify( { 'locking':lockmode } );
			const options = this.buildOptions('/api/device/' + device_id + '/control', 'PUT', this.sureFlapState['token']);

			this.httpRequest('set_lockmode', options, postData).then(() => {
				return resolve();
			}).catch(error => {
				return reject(error);
			});
		}));
	}

	/**
	 * sets the curfew
	 * @param {string} device
	 * @param {object} curfew
	 * @return {Promise}
	 */
	setCurfew(device, curfew) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const device_id = this.getDeviceId(device);
			const postData = JSON.stringify( { curfew } );
			const options = this.buildOptions('/api/device/' + device_id + '/control', 'PUT', this.sureFlapState['token']);

			this.httpRequest('set_curfew', options, postData).then(() => {
				return resolve();
			}).catch(error => {
				return reject(error);
			});
		}));
	}

	/**
	 * sets the pet location
	 * @param {string} hierarchy
	 * @param {string} pet
	 * @param {boolean} value
	 * @return {Promise}
	 */
	setPetLocation(hierarchy, pet, value) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const pet_id = this.getPetId(pet);
			const postData = JSON.stringify( { 'where':(value ? '1' : '2'), 'since':this.getCurrentDateFormatted() } );
			const options = this.buildOptions('/api/pet/' + pet_id + '/position', 'POST', this.sureFlapState['token']);

			this.httpRequest('set_pet_location', options, postData).then(() => {
				return resolve();
			}).catch(error => {
				return reject(error);
			});
		}));
	}

	/****************************************
	 * methods to set values to the adapter *
	 ****************************************/

	/**
	 * sets connection status to the adapter
	 * @param {boolean} connected
	 */
	setConnectionStatusToAdapter(connected) {
		/* objects created via io-package.json, no need to create them here
		this.setObjectNotExists('info', this.buildChannelObject('Information'));
		this.setObjectNotExists('info.connection', this.buildStateObject('If connected to surepetcare api', 'indicator.connected'));
		*/
		this.setState('info.connection', connected, true);
	}

	/**
	 * sets global online status to the adapter
	 */
	setGlobalOnlineStatusToAdapter() {
		// all devices online status
		if (!this.sureFlapStatePrev.all_devices_online || (this.sureFlapState.all_devices_online !== this.sureFlapStatePrev.all_devices_online)) {
			const obj_name = 'info.all_devices_online';
			/* objects created via io-package.json, no need to create them here
			this.setObjectNotExists('info', this.buildChannelObject('Information'));
			this.setObjectNotExists(obj_name, this.buildStateObject('If all devices are online','indicator.reachable'));
			*/
			this.setState(obj_name, this.sureFlapState.all_devices_online, true);
		}
	}

	/**
	 * sets locking mode and curfew to the adapter
	 * @param {string} prefix
	 * @param {string} hierarchy
	 * @param {number} deviceIndex
	 */
	setSureflapConnectToAdapter(prefix, hierarchy, deviceIndex) {
		// lock mode
		if (!this.sureFlapStatePrev.devices || (this.sureFlapState.devices[deviceIndex].status.locking.mode !== this.sureFlapStatePrev.devices[deviceIndex].status.locking.mode)) {
			const obj_name =  prefix + hierarchy + '.' + this.sureFlapState.devices[deviceIndex].name + '.control' + '.lockmode';
			try {
				this.setState(obj_name, this.sureFlapState.devices[deviceIndex].status.locking.mode, true);
			} catch(error) {
				this.log.error(`could not set lock mode to adapter (${error})`);
			}
		}

		// curfew
		if (!this.sureFlapStatePrev.devices || (JSON.stringify(this.sureFlapState.devices[deviceIndex].control.curfew) !== JSON.stringify(this.sureFlapStatePrev.devices[deviceIndex].control.curfew))) {
			if(this.sureFlapStatePrev.devices && this.sureFlapStatePrev.devices[deviceIndex].control.curfew) {
				this.setCurfewToAdapter(prefix, hierarchy, deviceIndex, this.sureFlapStatePrev, 'last_curfew');
			}

			this.setCurfewToAdapter(prefix, hierarchy, deviceIndex, this.sureFlapState, 'curfew');

			const obj_name =  prefix + hierarchy + '.' + this.sureFlapState.devices[deviceIndex].name + '.control' + '.curfew';
			try {
				this.setState(obj_name, this.isCurfewEnabled(this.sureFlapState.devices[deviceIndex].control.curfew), true);
			} catch(error) {
				this.log.error(`could not set curfew to adapter (${error})`);
			}
		}

		const obj_name =  prefix + hierarchy + '.' + this.sureFlapState.devices[deviceIndex].name + '.curfew_active';
		try {
			const new_val = this.isCurfewActive(this.sureFlapState.devices[deviceIndex].control.curfew);
			this.getStateValueFromAdapter(obj_name).then(old_val =>{
				if(old_val != new_val) {
					this.setState(obj_name, new_val, true);
					this.log.debug(`changing curfew_active from ${old_val} to ${new_val}`);
				}
			}).catch(() => {
				this.setState(obj_name, new_val, true);
				this.log.debug(`setting curfew_active to ${new_val}`);
			});
		} catch(error) {
			this.log.error(`could not set curfew_active to adapter (${error})`);
		}
	}

	/**
	 * sets curfew to the adapter
	 * @param {string} prefix
	 * @param {string} hierarchy
	 * @param {number} deviceIndex
	 * @param {object} new_state
	 * @param {string} curfew
	 */
	setCurfewToAdapter(prefix, hierarchy, deviceIndex, new_state, curfew) {
		const obj_name =  prefix + hierarchy + '.' + new_state.devices[deviceIndex].name + '.' + curfew;
		this.getCurfewCountFromAdapter(obj_name).then(num_curfew => {

			this.getCurfewFromAdapter(obj_name).then(curfewObj => {
				this.log.debug(`current ${curfew}: ${JSON.stringify(curfewObj)}`);
			});

			this.log.debug(`number of ${curfew} settings changes from ${num_curfew} to ${new_state.devices[deviceIndex].control.curfew.length}.`);
			if(num_curfew > new_state.devices[deviceIndex].control.curfew.length) {
				this.log.debug(`cleaning up ${curfew}.`);
				for(let h = new_state.devices[deviceIndex].control.curfew.length; h < num_curfew; h++) {
					['.enabled','.lock_time','.unlock_time',''].forEach(state => {
						this.getObject(obj_name + '.' + h + state, (err, obj) => {
							if(obj) {
								this.log.debug(`delete id: ${obj._id}`);
								this.delObject(obj._id, (err) => {
									if(err) {
										this.log.error(`could not delete object '${obj_name}.${h}${state}' (${err})`);
									}
								});
							}
						});
					});
				}
			}

			for(let h = 0; h < new_state.devices[deviceIndex].control.curfew.length; h++) {
				this.setObjectNotExists(obj_name + '.' + h, this.buildChannelObject('curfew setting ' + h), () => {
					['enabled','lock_time','unlock_time'].forEach(state => {
						this.setObjectNotExists(obj_name + '.' + h + '.' + state, this.buildStateObject(state, state === 'enabled' ? 'indicator' : 'value', state === 'enabled' ? 'boolean' : 'string'), () => {
							this.setState(obj_name + '.' + h + '.' + state, state === 'enabled' ? new_state.devices[deviceIndex].control.curfew[h][state] == true : new_state.devices[deviceIndex].control.curfew[h][state], true);
						});
					});
				});
			}
		}).catch(error => {
			this.log.warn(`could not set curfew data to adapter (${error})`);
		});
	}

	/**
	 * sets battery status to the adapter
	 * @param {string} prefix
	 * @param {string} hierarchy
	 * @param {number} deviceIndex
	 */
	setBatteryStatusToAdapter(prefix, hierarchy, deviceIndex) {
		// battery status
		if (!this.sureFlapStatePrev.devices || (this.sureFlapState.devices[deviceIndex].status.battery !== this.sureFlapStatePrev.devices[deviceIndex].status.battery)) {
			const obj_name =  prefix + hierarchy + '.' + this.sureFlapState.devices[deviceIndex].name + '.' + 'battery';
			this.setState(obj_name, this.sureFlapState.devices[deviceIndex].status.battery, true);
		}

		if (!this.sureFlapStatePrev.devices || (this.sureFlapState.devices[deviceIndex].status.battery_percentage !== this.sureFlapStatePrev.devices[deviceIndex].status.battery_percentage)) {
			const obj_name =  prefix + hierarchy + '.' + this.sureFlapState.devices[deviceIndex].name + '.' + 'battery_percentage';
			this.setState(obj_name, this.sureFlapState.devices[deviceIndex].status.battery_percentage, true);
		}
	}

	/**
	 * sets hub status to the adapter
	 * @param {string} prefix
	 * @param {number} deviceIndex
	 */
	setHubStatusToAdapter(prefix,deviceIndex) {
		if (!this.sureFlapStatePrev.devices || (this.sureFlapState.devices[deviceIndex].status.led_mode !== this.sureFlapStatePrev.devices[deviceIndex].status.led_mode)) {
			const obj_name =  prefix + '.' + this.sureFlapState.devices[deviceIndex].name + '.' + 'led_mode';
			this.setState(obj_name, this.sureFlapState.devices[deviceIndex].status.led_mode, true);
		}
	}

	/**
	 * sets online status of devices to the adapter
	 * @param {string} prefix
	 * @param {number} deviceIndex
	 */
	setOnlineStatusToAdapter(prefix,deviceIndex) {
		// online status
		if (!this.sureFlapStatePrev.devices || (this.sureFlapState.devices[deviceIndex].status.online !== this.sureFlapStatePrev.devices[deviceIndex].status.online)) {
			let obj_name =  prefix + '.' + this.sureFlapState.devices[deviceIndex].name + '.' + 'online';
			if ('parent' in this.sureFlapState.devices[deviceIndex]) {
				obj_name =  prefix + '.' + this.sureFlapState.devices[deviceIndex].parent.name + '.' + this.sureFlapState.devices[deviceIndex].name + '.' + 'online';
			}
			this.setState(obj_name, this.sureFlapState.devices[deviceIndex].status.online, true);
		}
	}

	/**
	 * sets pet status to the adapter
	 * @param {string} prefix
	 * @param {string} name
	 * @param {number} where
	 * @param {string} since
	 * @param {number} petIndex
	 */
	setPetStatusToAdapter(prefix, name, where, since, petIndex) {
		if (!this.sureFlapStatePrev.pets || (where !== this.sureFlapStatePrev.pets[petIndex].position.where)) {
			const obj_name = prefix + '.' + name;
			this.setState(obj_name + '.name', name, true);
			this.setState(obj_name + '.inside', (where == 1) ? true : false, true);
			this.setState(obj_name + '.since', since, true);
		}
	}

	/**
	 * reads curfew data from the adapter
	 * @param {string} obj_name
	 * @return {Promise} Promise of a curfew JSon object
	 */
	getCurfewFromAdapter(obj_name) {
		return new Promise((resolve, reject) => {
			this.getCurfewCountFromAdapter(obj_name).then(num_curfew => {
				const curfew = [];
				const promiseArray = [];
				for(let h = 0; h < num_curfew; h++) {
					curfew[h] = {};
					promiseArray.push(this.getStateValueFromAdapter(obj_name + '.' + h + '.' + 'enabled'));
					promiseArray.push(this.getStateValueFromAdapter(obj_name + '.' + h + '.' + 'lock_time'));
					promiseArray.push(this.getStateValueFromAdapter(obj_name + '.' + h + '.' + 'unlock_time'));
				}
				Promise.all(promiseArray).then((values) => {
					for(let h = 0; h < num_curfew; h++) {
						curfew[h]['enabled'] = values[h*3];
						curfew[h]['lock_time'] = values[h*3+1];
						curfew[h]['unlock_time'] = values[h*3+2];
					}
					return resolve(curfew);
				}).catch(err => {
					return reject(err);
				});
			}).catch(err => {
				return reject(err);
			});
		});
	}

	/**
	 * reads the number of curfews from the adapter
	 * @param {string} obj_name
	 * @return {Promise} Promise of a curfew count number
	 */
	getCurfewCountFromAdapter(obj_name) {
		return new Promise((resolve) => {
			this.getForeignObjects(this.name + '.' + this.instance + '.' + obj_name + '.*', 'channel', [], (err, obj) => {
				if(obj) {
					return resolve(Object.keys(obj).length);
				} else {
					return resolve(0);
				}
			});
		});
	}

	/**
	 * resets the control lockmode adapter value to the state value
	 * @param {string} hierarchy
	 * @param {string} device
	 */
	resetControlLockmodeToAdapter(hierarchy, device) {
		const deviceIndex = this.getDeviceIndex(device);
		const value = this.sureFlapState.devices[deviceIndex].status.locking.mode;
		this.log.debug(`resetting control lockmode for ${device} to: ${value}`);
		this.setState(hierarchy + '.control' + '.lockmode', value, true);
	}

	/**
	 * resets the control curfew adapter value to the state value
	 * @param {string} hierarchy
	 * @param {string} device
	 */
	resetControlCurfewToAdapter(hierarchy, device) {
		const deviceIndex = this.getDeviceIndex(device);
		const value = this.sureFlapState.devices[deviceIndex].control.curfew && this.isCurfewEnabled(this.sureFlapState.devices[deviceIndex].control.curfew);
		this.log.debug(`resetting control curfew for ${device} to: ${value}`);
		this.setState(hierarchy + '.control' + '.curfew', value, true);
	}

	/**
	 * resets the pet inside adapter value to the state value
	 * @param {string} hierarchy
	 * @param {string} pet
	 */
	resetPetInsideToAdapter(hierarchy, pet) {
		const petIndex = this.getPetIndex(pet);
		const value = this.sureFlapStatePrev.pets[petIndex].position.where;
		this.log.debug(`resetting pet inside for ${pet} to: ${value}`);
		this.setState(hierarchy + '.pets.' + pet + '.inside', value, true);
	}

	/************************************************
	 * methods to initially create object hierarchy *
	 ************************************************/

	/**
	 * creates the adapters object hierarchy
	 * @return {Promise}
	 */
	createAdapterObjectHierarchy() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			if(this.firstLoop === true) {
				this.createHouseholdsAndHubsToAdapter()
					.then(() => this.createDevicesToAdapter())
					.then(() => this.createPetsToAdapter())
					.then(() => { return resolve(); })
					.catch(() => { return reject(); });
			} else {
				return resolve();
			}
		}));
	}

	/**
	 * creates houshold and hub data structures in the adapter
	 * @return {Promise}
	 */
	createHouseholdsAndHubsToAdapter() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];
			// households
			for(let h = 0; h < this.sureFlapState.households.length; h++) {
				const prefix = this.sureFlapState.households[h].name;

				// create household folder
				this.setObjectNotExists(this.sureFlapState.households[h].name, this.buildFolderObject('Household \'' + this.sureFlapState.households[h].name_org + '\' (' + this.sureFlapState.households[h].id + ')'), () => {

					// create hub (devices in household without parent)
					for(let d = 0; d < this.sureFlapState.devices.length; d++) {
						if (this.sureFlapState.devices[d].household_id == this.sureFlapState.households[h].id) {
							if (!('parent' in this.sureFlapState.devices[d])) {
								const obj_name =  prefix + '.' + this.sureFlapState.devices[d].name;
								this.setObjectNotExists(obj_name, this.buildDeviceObject('Hub \'' + this.sureFlapState.devices[d].name_org + '\' (' + this.sureFlapState.devices[d].id + ')'), () => {
									promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.online', this.buildStateObject('If device is online','indicator.reachable')));
									promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.led_mode', this.buildStateObject('led mode', 'indicator', 'number', true, {0: 'OFF', 1:'HIGH', 4:'DIMMED' })));
									Promise.all(promiseArray).then(() => {
										return resolve();
									}).catch(error => {
										this.log.warn(`could not create household and hub hierarchy (${error})`);
										return reject();
									});
								});
							}
						}
					}
				});
			}
		}));
	}

	/**
	 * creates device hierarchy data structures in the adapter
	 * @return {Promise}
	 */
	createDevicesToAdapter() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];
			// households
			for(let h = 0; h < this.sureFlapState.households.length; h++) {
				const prefix = this.sureFlapState.households[h].name;

				// create devices in household with parent (sureflap and feeding bowl)
				for(let d = 0; d < this.sureFlapState.devices.length; d++) {
					if (this.sureFlapState.devices[d].household_id == this.sureFlapState.households[h].id) {
						if ('parent' in this.sureFlapState.devices[d]) {
							const obj_name =  prefix + '.' + this.sureFlapState.devices[d].parent.name + '.' + this.sureFlapState.devices[d].name;
							this.setObjectNotExists(obj_name, this.buildDeviceObject('Device \'' + this.sureFlapState.devices[d].name_org + '\' (' + this.sureFlapState.devices[d].id + ')'), () => {
								promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.curfew', this.buildChannelObject('curfew settings')));
								promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.last_curfew', this.buildChannelObject('last curfew settings')));
								promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.curfew_active', this.buildStateObject('If curfew is active','indicator')));
								promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.online', this.buildStateObject('If device is online','indicator.reachable')));
								promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.battery', this.buildStateObject('battery', 'value.voltage', 'number')));
								promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.battery_percentage', this.buildStateObject('battery percentage', 'value.battery', 'number')));
								this.setObjectNotExists(obj_name + '.control', this.buildChannelObject('control switches'), () => {
									promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.control' + '.lockmode', this.buildStateObject('lockmode', 'switch.mode.lock', 'number', false, {0: 'OPEN', 1:'LOCK INSIDE', 2:'LOCK OUTSIDE', 3:'LOCK BOTH'})));
									promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.control' + '.curfew', this.buildStateObject('curfew', 'switch', 'boolean', false)));
									Promise.all(promiseArray).then(() => {
										return resolve();
									}).catch(error => {
										this.log.warn(`could not create adapter device hierarchy (${error})`);
										return reject();
									});
								});
							});
						}
					}
				}
			}
		}));
	}

	/**
	 * creates pet hierarchy data structures in the adapter
	 * @return {Promise}
	 */
	createPetsToAdapter() {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];
			const numPets = this.sureFlapState.pets.length;

			for (let i = 0; i < numPets; i++) {
				const name = this.sureFlapState.pets[i].name;
				const name_org = this.sureFlapState.pets[i].name_org;
				const petId = this.sureFlapState.pets[i].id;
				const household_name = this.getHouseholdNameForId(this.sureFlapState.pets[i].household_id);
				const prefix = household_name + '.pets';

				// TODO: remove deleted pets
				promiseArray.push(this.createPetHierarchyToAdapter(prefix, household_name, name, name_org, petId));
			}
			Promise.all(promiseArray).then(() => {
				return resolve();
			}).catch(() => {
				return reject();
			});
		}));
	}

	/**
	 * creates hierarchy data structures for the given pet in the adapter
	 * @param {string} prefix
	 * @param {string} household_name
	 * @param {string} name
	 * @param {string} name_org
	 * @param {number} id
	 * @return {Promise}
	 */
	createPetHierarchyToAdapter(prefix, household_name, name, name_org, id) {
		return /** @type {Promise<void>} */(new Promise((resolve, reject) => {
			const promiseArray = [];
			const obj_name = prefix + '.' + name;
			this.setObjectNotExists(prefix, this.buildDeviceObject('Pets in Household ' + household_name),() => {
				this.setObjectNotExists(obj_name, this.buildChannelObject('Pet \'' + name_org + '\' (' + id + ')'),() => {
					promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.name', this.buildStateObject(name_org, 'text', 'string')));
					promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.inside', this.buildStateObject('is ' + name + ' inside', 'indicator', 'boolean', false)));
					promiseArray.push(this.setObjectNotExistsPromise(obj_name + '.since', this.buildStateObject('last location change', 'date', 'string')));
					Promise.all(promiseArray).then(() => {
						return resolve();
					}).catch(error => {
						this.log.warn(`could not create adapter pet hierarchy (${error})`);
						return reject();
					});
				});
			});
		}));
	}

	/******************
	 * helper methods *
	 ******************/

	/**
	 * sets the offline devices in the surepet data
	 */
	setOfflineDevices() {
		this.sureFlapState.all_devices_online = true;
		this.sureFlapState.offline_devices = [];
		for (let d = 0; d < this.sureFlapState.devices.length; d++) {
			this.sureFlapState.all_devices_online = this.sureFlapState.all_devices_online && this.sureFlapState.devices[d].status.online;
			if (!this.sureFlapState.devices[d].status.online) {
				this.sureFlapState.offline_devices.push(this.sureFlapState.devices[d].name);
			}
			if (this.sureFlapState.devices[d].status.battery) {
				this.sureFlapState.devices[d].status.battery_percentage = this.calculateBatteryPercentage(this.sureFlapState.devices[d].status.battery);
			}
		}
	}

	/**
	 * Returns wether the curfew is enabled
	 * @param {object} curfew an array of curfew settings
	 * @return {boolean}
	 */
	isCurfewEnabled(curfew) {
		let enabled = false;
		if(curfew.length > 0) {
			for(let h = 0; h < curfew.length; h++) {
				enabled = enabled || curfew[h].enabled;
			}
		}
		return enabled;
	}

	/**
	 * Calculates wether the current curfew is active
	 * @param {object} curfew an array of curfew settings
	 * @return {boolean}
	 */
	isCurfewActive(curfew) {
		const current_date = new Date();
		const current_hour = current_date.getHours();
		const current_minutes = current_date.getMinutes();
		for(let h = 0; h < curfew.length; h++) {
			if('enabled' in curfew[h] && curfew[h]['enabled'] && 'lock_time' in curfew[h] && 'unlock_time' in curfew[h]) {
				const start = curfew[h]['lock_time'].split(':');
				const end = curfew[h]['unlock_time'].split(':');
				const start_hour = parseInt(start[0]);
				const start_minutes = parseInt(start[1]);
				const end_hour = parseInt(end[0]);
				const end_minutes = parseInt(end[1]);
				//this.log.debug(`curfew ${h} start ${start_hour}:${start_minutes} end ${end_hour}:${end_minutes} current ${current_hour}:${current_minutes}`);
				if(start_hour < end_hour || (start_hour === end_hour && start_minutes < end_minutes)) {
					// current time must be between start and end
					if(start_hour < current_hour || (start_hour === current_hour && start_minutes <= current_minutes)) {
						if(end_hour > current_hour || (end_hour === current_hour && end_minutes > current_minutes)) {
							return true;
						}
					}
				} else {
					// current time must be after start or before end
					if(start_hour < current_hour || (start_hour === current_hour && start_minutes <= current_minutes)) {
						return true;
					} else if(end_hour > current_hour || (end_hour === current_hour && end_minutes > current_minutes)) {
						return true;
					}
				}
			}
		}
		return false;
	}

	/**
	 * reads a state value from the adapter
	 * @param {string} obj_name
	 * @return {Promise} Promise of a adapter state value
	 */
	getStateValueFromAdapter(obj_name) {
		return new Promise((resolve, reject) => {
			this.getState(obj_name, (err, obj) => {
				if (obj) {
					return resolve(obj.val);
				} else {
					return reject(err);
				}
			});
		});
	}

	/**
	 * returns the device id of the device
	 * @param {string} name
	 * @return {string} device id
	 */
	getDeviceId(name) {
		for (let i=0; i < this.sureFlapState.devices.length; i++) {
			if (this.sureFlapState.devices[i].name === name) {
				return this.sureFlapState.devices[i].id;
			}
		}
		return '';
	}

	/**
	 * returns the device index
	 * @param {string} name
	 * @return {number} device index
	 */
	getDeviceIndex(name) {
		for (let i=0; i < this.sureFlapState.devices.length; i++) {
			if (this.sureFlapState.devices[i].name === name) {
				return i;
			}
		}
		return -1;
	}

	/**
	 * returns the device type of the device
	 * @param {string} name
	 * @return {number} device type
	 */
	getDeviceType(name) {
		for (let i=0; i < this.sureFlapState.devices.length; i++) {
			if (this.sureFlapState.devices[i].name === name) {
				return this.sureFlapState.devices[i].product_id;
			}
		}
		return -1;
	}

	/**
	 * returns the pet id of the pet
	 * @param {string} name
	 * @return {string} pet id
	 */
	getPetId(name) {
		for (let i=0; i < this.sureFlapState.pets.length; i++) {
			if (this.sureFlapState.pets[i].name === name) {
				return this.sureFlapState.pets[i].id;
			}
		}
		return '';
	}

	/**
	 * returns the pet index of the pet
	 * @param {string} name
	 * @return {number} pet index
	 */
	getPetIndex(name) {
		for (let i=0; i < this.sureFlapState.pets.length; i++) {
			if (this.sureFlapState.pets[i].name === name) {
				return i;
			}
		}
		return -1;
	}

	/**
	 * returns the household name of given household id
	 * @param {string} id a household id
	 * @return {string} household name
	 */
	getHouseholdNameForId(id) {
		for (let i=0; i < this.sureFlapState.households.length; i++) {
			if (this.sureFlapState.households[i].id === id) {
				return this.sureFlapState.households[i].name;
			}
		}
		return '';
	}

	/**
	 * normalizes lockmode by changing lockmode 4 to 0
	 * Catflap has 4 lockmodes, Petflap has 5 lockmodes (extra mode for curfew)
	 * scince control should be the same for both flaps, lockmode 4 is removed
	 * and curfew is controlled via control.curfew
	 */
	normalizeLockMode() {
		for (let d = 0; d < this.sureFlapState.devices.length; d++) {
			if('locking' in this.sureFlapState.devices[d].status && 'mode' in this.sureFlapState.devices[d].status.locking) {
				if(this.sureFlapState.devices[d].status.locking.mode === 4) {
					this.sureFlapState.devices[d].status.locking.mode = 0;
				}
			}
		}
	}

	/**
	 * checks every device and makes the curfew an array if it's not
	 */
	makeCurfewArray() {
		for (let d = 0; d < this.sureFlapState.devices.length; d++) {
			if('curfew' in this.sureFlapState.devices[d].control) {
				if(!Array.isArray(this.sureFlapState.devices[d].control.curfew)) {
					this.sureFlapState.devices[d].control.curfew = [this.sureFlapState.devices[d].control.curfew];
				}
			} else {
				this.sureFlapState.devices[d].control.curfew = [];
			}
		}
	}

	/**
	 * removes whitespaces and special characters from device, household and pet names
	 */
	makeNamesCanonical() {
		const reg = /[^\w]/ig;
		const rep = '_';

		for (let d = 0; d < this.sureFlapState.devices.length; d++) {
			if (this.sureFlapState.devices[d].name) {
				this.sureFlapState.devices[d].name_org = this.sureFlapState.devices[d].name;
				this.sureFlapState.devices[d].name = this.sureFlapState.devices[d].name_org.replace(reg, rep);
			}
			if (this.sureFlapState.devices[d].parent && this.sureFlapState.devices[d].parent.name) {
				this.sureFlapState.devices[d].parent.name_org = this.sureFlapState.devices[d].parent.name;
				this.sureFlapState.devices[d].parent.name = this.sureFlapState.devices[d].parent.name_org.replace(reg, rep);
			}
		}
		for (let d = 0; d < this.sureFlapState.households.length; d++) {
			if (this.sureFlapState.households[d].name) {
				this.sureFlapState.households[d].name_org = this.sureFlapState.households[d].name;
				this.sureFlapState.households[d].name = this.sureFlapState.households[d].name_org.replace(reg, rep);
			}
		}
		for (let d = 0; d < this.sureFlapState.pets.length; d++) {
			if (this.sureFlapState.pets[d].name) {
				this.sureFlapState.pets[d].name_org = this.sureFlapState.pets[d].name;
				this.sureFlapState.pets[d].name = this.sureFlapState.pets[d].name_org.replace(reg, rep);
			}
		}
	}

	/**
	 * returns the current date and time as Y-m-d H:i
	 * @return {string}
	 */
	getCurrentDateFormatted()
	{
		const date = new Date().toISOString();
		return date.slice(0,10) + ' ' + date.slice(11,16);
	}

	/**
	 * returns the battery percentage
	 * @param {number} battery
	 * @return {number}
	 */
	calculateBatteryPercentage(battery)
	{
		if (battery <= 5) {
			return 0;
		} else if (battery >= 6) {
			return 100;
		} else {
			return Math.round((1 - Math.pow(6 - battery,2)) * 100);
		}
	}

	/**
	 * builds a options JSon object for a http request
	 * @param {string} path
	 * @param {string} method
	 * @param {string} token
	 * @return {object}
	 */
	buildOptions(path, method, token) {
		const options = {
			hostname: 'app.api.surehub.io',
			port: 443,
			path: path,
			method: method,
			headers: {
				'Host' : 'app.api.surehub.io',
				'Accept' : 'application/json, text/plain, */*',
				'Referer' : 'https://surepetcare.io/',
				'Content-Type' : 'application/json;charset=utf-8',
				'Origin' :  'https://surepetcare.io',
			}
		};

		if (token != undefined && token != '') {
			options.headers['Authorization'] = 'Bearer ' + token;
		}

		return options;
	}

	/**
	 * builds a login JSon data object
	 * @return {object}
	 */
	buildLoginJsonData() {
		return {
			// @ts-ignore
			'email_address': this.config.username,
			// @ts-ignore
			'password': this.config.password,
			'device_id':'1050547954'
		};
	}

	/**
	 * builds a state object
	 * @param {string} name
	 * @param {string} role
	 * @param {string} type
	 * @param {boolean} readonly
	 * @param {object} states
	 * @return {object}
	 */
	buildStateObject(name, role = 'indicator', type = 'boolean', readonly = true, states = undefined) {
		return states === undefined ? {
			type: 'state',
			common: {
				name: name,
				role: role,
				type: type,
				read: true,
				write: !readonly
			},
			native: {}
		} : {
			type: 'state',
			common: {
				name: name,
				role: role,
				type: type,
				read: true,
				write: !readonly,
				states: states
			},
			native: {}
		};
	}

	/**
	 * builds a device object
	 * @param {string} name
	 * @return {object}
	 */
	buildDeviceObject(name) {
		return {
			type: 'device',
			common: {
				name: name,
				role: ''
			},
			native: {}
		};
	}

	/**
	 * builds a channel object
	 * @param {string} name
	 * @return {object}
	 */
	buildChannelObject(name) {
		return {
			type: 'channel',
			common: {
				name: name,
				role: ''
			},
			native: {}
		};
	}

	/**
	 * builds a folder object
	 * @param {string} name
	 * @return {object}
	 */
	buildFolderObject(name) {
		return {
			type: 'folder',
			common: {
				name: name,
				role: ''
			},
			native: {}
		};
	}

	/**
	 * does a http request
	 * @param {string} tag
	 * @param {object} options
	 * @param {object} postData
	 * @return {Promise} Promise of an response JSon object
	 */
	httpRequest(tag, options, postData) {
		return new Promise((resolve, reject) => {
			const req = https.request(options, (res) => {

				if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
					req.on('error', error => {
						this.log.error(`error: ${error.toString()}`);
					});
					const data = [];
					res.on('data', (chunk) => {
						data.push(chunk);
					});
					res.on('end', () => {
						this.log.debug(`result: ${data.join('')}`);
					});
					return reject(new Error(`Request returned status code ${res.statusCode}`));
				} else {
					const data = [];
					res.on('data', (chunk) => {
						data.push(chunk);
					});
					res.on('end', () => {
						try {
							const obj = JSON.parse(data.join(''));
							return resolve(obj);
						} catch(err) {
							this.log.error(err.message);
							return reject(new Error(`JSon parse error in ${data}`));
						}
					});
				}
			});

			req.on('error', (err) => {
				return reject(new Error(`Request error: ${err} retrying in 10 seconds`));
			});

			req.write(postData);
			req.end();
		});
	}
}

// @ts-ignore parent is a valid property on module
if (module.parent) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Sureflap(options);
} else {
	// otherwise start the instance directly
	new Sureflap();
}
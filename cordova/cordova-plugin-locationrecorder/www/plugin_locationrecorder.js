class LocationRecorderPlugin{
	constructor(){
	}

	startService(minTime, minDistance, uploadDuration){
		return new Promise(function(resolve, reject){
			cordova.exec(
				function(result){
					resolve(result);
				},
				function(err){
					reject(err);
				},
				"LocationRecorderPlugin", "startService",
				[minTime, minDistance, uploadDuration]);
		});
	}

	stopService(){
		return new Promise(function(resolve, reject){
			cordova.exec(
				function(result){
					resolve(result);
				},
				function(err){
					reject(err);
				},
				"LocationRecorderPlugin", "stopService",
				[]);
		});
	}

	isRunning(){
		return new Promise(function(resolve, reject){
			cordova.exec(
				function(result){
					resolve(result);
				},
				function(err){
					reject(err);
				},
				"LocationRecorderPlugin", "isRunning",
				[]);
		});
	}
	
	getLastLocation(){
		return new Promise(function(resolve, reject){
			cordova.exec(
				function(result){
					resolve(result);
				},
				function(err){
					reject(err);
				},
				"LocationRecorderPlugin", "getLastLocation",
				[]);
		});
	}

	getLocationList(){
		return new Promise(function(resolve, reject){
			cordova.exec(
				function(result){
					resolve(result);
				},
				function(err){
					reject(err);
				},
				"LocationRecorderPlugin", "getLocationList",
				[]);
		});
	}

	getPastLocationList(start_datetime, end_datetime){
		return new Promise(function(resolve, reject){
			cordova.exec(
				function(result){
					resolve(result);
				},
				function(err){
					reject(err);
				},
				"LocationRecorderPlugin", "getPastLocationList",
				[start_datetime, end_datetime]);
		});
	}

	getRunningParams(){
		return new Promise(function(resolve, reject){
			cordova.exec(
				function(result){
					resolve(result);
				},
				function(err){
					reject(err);
				},
				"LocationRecorderPlugin", "getRunningParams",
				[]);
		});
	}
	
	setBootup(enable){
		return new Promise(function(resolve, reject){
			cordova.exec(
				function(result){
					resolve(result);
				},
				function(err){
					reject(err);
				},
				"LocationRecorderPlugin", "setBootup",
				[enable]);
		});
	}	

	getBootup(){
		return new Promise(function(resolve, reject){
			cordova.exec(
				function(result){
					resolve(result);
				},
				function(err){
					reject(err);
				},
				"LocationRecorderPlugin", "getBootup",
				[]);
		});
	}
	
	setUploadUrl(uploadUrl){
		return new Promise(function(resolve, reject){
			cordova.exec(
				function(result){
					resolve(result);
				},
				function(err){
					reject(err);
				},
				"LocationRecorderPlugin", "setUploadUrl",
				[uploadUrl]);
		});
	}	

	getUploadUrl(){
		return new Promise(function(resolve, reject){
			cordova.exec(
				function(result){
					resolve(result);
				},
				function(err){
					reject(err);
				},
				"LocationRecorderPlugin", "getUploadUrl",
				[]);
		});
	}
	
	getDatabaseSize(){
		return new Promise(function(resolve, reject){
			cordova.exec(
				function(result){
					resolve(result);
				},
				function(err){
					reject(err);
				},
				"LocationRecorderPlugin", "getDatabaseSize",
				[]);
		});
	}
	
	getUserId(){
		return new Promise(function(resolve, reject){
			cordova.exec(
				function(result){
					resolve(result);
				},
				function(err){
					reject(err);
				},
				"LocationRecorderPlugin", "getUserId",
				[]);
		});
	}
	
	setCallback(enable, callback){
		cordova.exec(
			function(result){
				callback(result);
			},
			function(err){
				console.error("setCallback call failed");
			},
			"LocationRecorderPlugin", "setCallback",
			[enable]);
	}
}

module.exports = new LocationRecorderPlugin();

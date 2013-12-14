
	// Require Modules Dependencies
	var formidable   	= require('formidable');
	var fs 			  	= require('fs');
	var util 		  	= require('util');
	var mysql 		  	= require('diet-mysql');
	var uploadEvents 	= require('events');

	function uploadNamer(name, mime, logfile, UPLOAD_ID){
		++UPLOAD_ID;
		var stringID = UPLOAD_ID.toString();
		fs.writeFileSync(logfile, stringID);
		var id = UPLOAD_ID.toString(36) + uniqid();
		
		// MAKE an extension
		if(!isset(path.extname(name))){
			// jpeg fix
			if(mime == 'image/jpg') { var mime = 'image/jpeg'; }
			for(key in mimes){
				if(mimes[key] == mime){
					extension = '.' + key;
				}
			}
		// or GET the extension
		} else {
			var extension = path.extname(name);
		}
		
		var name = id + extension;
		return [id, name];
	}
	
	module.exports = function Upload(options){
		
		// ======( Upload Information Holders )======
		this.streams 	 = {};
		this.paused	 	 = {};
		this.emitter 	 = new uploadEvents.EventEmitter();
		this.emitter.setMaxListeners(0); // Unlimited Listeners
		this.uploads	 = this;
		this.options 	 = options;
		var currentFile = false;
			
		// ======( Load Function )======
		this.load = function(request, response, configure){
			console.log('#UPLOAD:', 'STARTED', '');
			// Get Upload ID
			var UPLOAD_ID = fs.readFileSync(configure.log, encoding='utf8');
			
			console.log('#UPLOAD:', 'UPLOAD ID', UPLOAD_ID);
			console.log('#UPLOAD:', 'configure.key', configure.key);
			
			// Get the Total Size of the Uploaded file(s)
			var total_size = request.headers['content-length'];
			
			console.log('#UPLOAD:', 'total_size', total_size, configure.size_total * 1048576);
			var fileNames  = [];
			
			// Validate total size of uploaded file(s)
			if(total_size < configure.size_total * 1048576){
				var form 			= formidable.IncomingForm(), // Get form Object
					key 			= configure.key,  // Easy reference for Upload Key
					total_received  = 0,
					files 			= [],
					fields 			= [],
					errors 			= [];

				// Where to Upload
				upload.streams[key] = {
					current  : false,
					received : 0,
					total 	: 0
				};
				
				console.log('#UPLOAD:', 'upload.emitter.emit', 'upload-event-' + key);
				
				upload.emitter.emit('upload-event-' + key);	
				
				// Pause Upload with HTTP Request
				upload.emitter.on('pause-upload-' + key, function(){
					request.pause(); console.log('PAUSE UPLOAD');
				});
				
				// Resume Upload with HTTP Request
				upload.emitter.on('resume-upload-' + key, function(){
					request.resume(); console.log('RESUME UPLOAD');
				});
				
				// On Progress
				form.on('progress', function(bytesReceived, bytesExpected){
					upload.streams[key].current  = currentFile;
					upload.streams[key].received = total_received;
					upload.streams[key].total 	  = total_size;
					upload.emitter.emit('upload-event-' + key);
					console.log(total_received + '/' + total_size + ' : EMIT -> ' + 'upload-event-' + key);
				});
				
				form.onPart = function(part) {
					console.log('#UPLOAD:', 'form.onPart', part);
					part.errors = [];
					
					// File Input
					if(part.filename){
						var names 		= uploadNamer(part.filename, part.mime, configure.log, UPLOAD_ID);
						part.size 		= 0;
						part.id			= names[0];
						part.name 		= names[1];
						part.path 		= strip_quotes(options.public + configure.path + part.name);
						part.filename 	= strip_quotes(part.filename);
						currentFile   	= part;
						if(!inArray(fileNames, part.name)){
							fileNames.push(part.name);
						}

						// Validate Mime
						if(isset(configure.mime)){	
							if(inArray(part.mime, configure.mime)){
								validMime = true;
							} else {
								validMime = false;
							}
						
						} else {
							validMime = true;
						}
						
						// =======( START UPLOADING )=======
						if(validMime){
							// Create File and it's stream
							var stream 	= fs.createWriteStream(part.path);
							
							// ======= ( UPLOAD IN PROGRESS - event ) =======
							part.on('data', function drainData(buffer){
								// Validate File Size
								if(part.size < configure.size_each * 1048576){
									part.size 			 += buffer.length;
									part.lastModifiedDate = new Date();
									total_received		 += buffer.length;
									
									stream.write(buffer, function() {
										form.emit('progress');
									});

								// Error with File Size
								} else {
									part.removeListener('data', drainData);
									part.errors.push('size');
									upload.emitter.emit('upload-error-' + configure.key, { type : 'size', file : part, key : configure.key });
									fs.unlink(part.path);

								}
							});
							
							// ======= ( FILE TOTALLY UPLOADED - event ) =======
							part.on('end', function(){
								// Set Path for HTTP
								part.path = configure.path + part.name;
								
								// Push File to Files Array 
								files.push(part);

							});
							
						// Error with Mime Type
						} else {
							part.errors.push('mime');
							upload.emitter.emit('upload-error-' + configure.key, { 
								type : 'mime', 
								file : part, 
								key : configure.key 
							});
							console.log('MIME TYPE ERROR');
							fs.unlink(part.path);
						
							//request.connection.destroy();
						}

					// Normal Input
					} else {
						fields.push(part);
					}
					
				}
								
				form.on('end', function(){
					total_received = total_size;
					form.emit('progress');
					
					console.log('## FORM ON END [START]');
					
					function mysql_finished(request, response, mysql_object){
						console.log('## MYSQL FINISHED');
						
						
						
						// ---- Work with File
						if(isset(configure.commands)){
						
							// Work with each Mime Type
							for(commandsKey in configure.commands){
								var convertedMime = convertMimes(commandsKey);
								var files_length = files.length;
								console.log('files.length->' + files.length);
								for(var i = 0; i < files_length; i++){
									var file = files[i];
								
									if(inArray(file.mime, convertedMime)){
										var commands = configure.commands[commandsKey];
										
										for(commandKey in commands){
											var command = commands[commandKey];
											command.path = command.path;
											// Thumbnail Command
											if(commandKey == 'thumbnail'){
												// Execute ImageMagick Command to create Thumbnail
												var destination = options.public + command.path + file.name; 
												var path = options.public + file.path;
												exec('identify ' + path, function(error, stdout, stderr){
													if(error !== null) { console.log('upload thumbnail identify exec error: ' + error); }
													var split_output = stdout.split(/\s/);
													var dimensions 	 = split_output[2].split('x');
													var width 		 = dimensions[0];
													var height		 = dimensions[1];
													
													if(width < command.width || height < command.height){
														var cmd = 'convert ' + path 
																+ ' -thumbnail \'' 
															 	+ command.width + 'x' + command.height + '>\' ' 
															 	+ '-gravity center -extent 64x64 ' 
															 	+ options.public + command.path + file.name;
															 	+ " -alpha set " 
													} else {
														var cmd = "convert " + escape_quotes(path) 
																+ " -resize \""+command.width+"x"+command.height+"^\" "
																+ " -gravity center "
																+ "-crop "+command.width+"x"+command.height+"+0+0 +repage " + destination;
																+ " -alpha set " 
													}
													
													console.log(cmd);
													
													exec(cmd, function(error, stdout, stderr){
														if(error !== null) { 
															console.log('upload thumbnail convert exec error: ' + error); 
														} else {
															// If this is the last processed file
															console.log(i + ' VS ' + files.length);
															if(i == files.length){
																console.log('END UPLOAD')
																configure.end(request, response, errors, fields, files, mysql_object);
																/*
																if(!isset(configure.disable_mysql)){
																	/*mysql(options.mysql, function(mysqlObject, error){
																		// Create Custom MySQL Object
																		mysqlObject.error = error;
																		var mysql_object = mysql_wrapper(request, response, mysqlObject);
																		
																		configure.end(request, response, errors, fields, files, mysql_object);	
																		
																	}, 'mes');
																	mysql_instance(request, response, callback, custom_db, options.mysql);
																	
																	
																	configure.end(request, response, errors, fields, files, mysql_object);
																	
																} else {
																	configure.end(request, response, errors, fields, files, null);
																	console.log(' :: FORM PROCESS HAS ENDED :: ');
																}*/
															}
														}
													});
												});
											} // end of if
											
										} // end of for											
									}
								}
							}
						} else {	
							configure.end(request, response, errors, fields, files, mysql_object);
							/*
							if(!isset(configure.disable_mysql)){
								mysql(options.mysql, function(mysqlObject, error){
									// Create Custom MySQL Object
									mysqlObject.error = error;
									var mysql_object = mysql_wrapper(request, response, mysqlObject);
									configure.end(request, response, errors, fields, files, mysql_object);	
									
								}, 'mes');
							} else {
									
								console.log(' :: FORM PROCESS HAS ENDED :: ');
							}	*/
						}
					} // mysql_finished
					
					
					
					// MYSQL setup
					var MySQLMap = null;
					if(!isset(configure.disable_mysql)){
						console.log('## NOO configure.disable_mysql');
						console.log('## MySQL Client SETUP 1..');
						console.log(options.mysql);
						
						var MySQL = new MySQLClient(options.mysql);
						
						console.log(MySQL);
						console.log('## MySQL Client SETUP 2..');
						
						if(!isset(options.mysql.disable_map)){
							console.log('## MAP IS [ENABLE]');
							console.log('## MYSQL MAP START');
							var mysql_namespace = options.mysql.namespace || 'mysql';
							MySQL.map(function(map){
								var MySQLMap = map;
								console.log('## MYSQL MAP ENDED', options);
								mysql_instance(options.app, request, response, function(request, response, mysql_object){
									mysql_object.database = options.mysql.database;
									mysql_finished(request, response, mysql_object);
								}, options.mysql.database, options.app, MySQLMap);
							});
						} else {
							console.log('## MAP IS [DISABLED]');
							
							// Connect to MySQL
							MySQL.connect(function(mysqlObject, error){
								
								// Append MySQL Error to MySQL Object
								mysqlObject.error = error;
								
								// MySQL Query Wrapper
								var mysql_object = mysql_wrapper(request, response, mysqlObject, {});
									//mysql_object = hook(mysql_object, MySQLMap);
								
								// Run Custom Function After MySQL Connected
								mysql_finished(request, response, mysql_object);
								
							}, options.mysql.database);
						}
					} else {
						console.log('## YESS configure.disable_mysql');
						mysql_finished(request, response, null);
					}
					
					
					
					console.log('## FORM ON END <[END]>');
				});
				
				form.on('aborted', function(){
					request.pause();
					for(var i = 0; i < files.length; i++){
						var file = files[i];
						console.log(file);
						fs.unlink(file.path);
					}
					keys.remove(configure.key);
					console.log(' :: REQUEST ABORTED :: ');
				});
				console.log('form.parse start...');
				form.parse(request);
				
			// Error files upload size is too large!
			} else {
				request.pause();
				upload.emitter.emit('upload-error-' + configure.key, { type : 'size', key : configure.key });
				//console.log('TOTAL FILE SIZER ERROR - EMITTING : [ ' + 'upload-message-' + configure.key + ' ]');
			}
			
		}
	};
	
	function convertMimes(mime){
		if(mime == 'images'){ 
			return ['image/png', 'image/gif', 'image/jpg', 'image/jpeg'];
		} else {
			return [mime];
		}
	}
	
	function resizeCommand(part, resize, options){
		// convert /root/mes/static/uploads/avatars/image.png -thumbnail '64x64>' -background black -gravity center -extent 64x64 /root/mes/static/uploads/avatars/image2.png
		var resizeOptions = resize;
		resizeOptions.dstPath = options.public + resizeOptions.dstPath + part.name;
		resizeOptions.srcPath = part.path;
		
		console.log(resizeOptions);
		
		Image.resize(resizeOptions, function(error, stdout, stderr){
			if(error){ console.log('ERROR in line 252: file resizing in the upload module : ' + error); }
			console.log(stdout);
			
		});
	}

			
	
	/*
			form.on('fileBegin', function onFileBegin(name, file){
				//form.removeListener('fileBegin', onFileBegin);
				//request.abort();
				//response.end('something went wrong…');
				
				/*file.error = [];
				
				var allowedTypes = [];
				
				for(var i = 0; i < configure.options.length; i++){
					var conf =  configure.options[i];
					for(type in conf){
						var option = conf[type];
						allowedTypes.push(type);
					}
				}

				if(!inArray(file.type, allowedTypes)){
					file.error.push('type');
					if(!isset(upload.connectionDestroyed)){
						console.log('±±±±±±±±± CONNECTION DESTROYED');
						response.end('Invalid File Uploading!');
						request.connection.destroy();
						upload.connectionDestroyed = true;
						form.removeListener('fileBegin', onFileBegin);
					}
					
					errored.push(file);
    			}

		    	if(errored.length > 0 && !inArray(file, errored)){
		    		errored.push(file);
		    	}
			});
			
			upload.emitter.emit('upload-event-' + key);
			
			form.on('progress', onProgress);
			
			function onProgress(received, total){
				if(received > 200){
					request.connection.destroy();
					form.removeListener('progress', onProgress);
				}
				
				upload.streams[key].received = received;
				upload.streams[key].total = total;
			}
			
			form.on('error', function(error){
				console.log(error);
			});
			
			form.on('aborted', function(){
				console.log('request aborted');
			});
			
		    form.parse(request, function(err, fields, files) {
		    	console.log('...form parse');
				
				if(errored.length > 0){
					console.log('form parsing ended…..');
					response.end('FUCK YOU!');
					
					for(var i = 0; i < errored.length; i++){
						fs.unlink(errored[i].path, function(error){ 
			    			if(error){ console.log('error in upload modules index.js with form.on fileBegin event:\n' + error); }
			    		});
					}
				} else {
					console.log('EVERYTHING IS OK!… The file uploading was successfull.');
			   		// MySQL is called here
			    	var mysql = require('/root/node_modules/application/lib/mysql');
			    	mysql(function(mysql, error){
			    		
			    		var cleanedFiles = [];
			    		
			    		for(var i = 0; i < files.length; i++){
			    			var file = files[i];
			    			
			    			var cleanedFile = {
			    				name : file.name,
			    				type : file.type,
			    				path : options.paths[file.type],
			    				size : file.size
			    			};
			    			
			    			console.log(file.path);
			    			fs.rename(file.path, options.public + cleanedFile.path + cleanedFile.name, function(){});
			    			cleanedFiles.push(cleanedFile);
			    			
			    		}
			    		
			    		//keys.remove(key);
				   		upload.streams[key].received = upload.streams[key].total;
				    	//response.end(util.inspect({fields: fields, files: files}));
				    	
				    	var message = 'hello world';
				    	console.log(cleanedFiles);
				    	
				    	configure.end(cleanedFiles, mysql);
				    	//configure.end(message, fields, files, cleanedFiles, mysql);
		    		}, 'mes');
		    	}
		    	
		    });
	*/

## Upload Module  
Node.js upload module built on formidable. It's fast and supports progress tracking and mysql.


### Install
If you have `diet` it's already installed.
```
npm install diet-upload
```

### Todo:
- Simplify API
- Better Documentation
- Create an independent image processing API.

### Node.js Setup:
```
// Setup
upload = new Upload({
	// Original Paths
	public	: '/root/static/files/',
	path	: '/root/static/files/uploads/',
	tmp		: '/root/mes/tmp/',
	// Custom upload paths
	paths : {
		// Images
		'image/gif' : 'uploads/images/',
		'image/jpg' : 'uploads/images/',
		'image/png' : 'uploads/'
	},
	// Mysql
	mysql: app.mysql
});
```

### Example:
```
// LISTENER function
upload.listener = function(name, configure){
	// REGISTER upload type contents
	upload.contents[name] = {};
	
	// REGISTER upload path
	var regex = new RegExp('^\/upload\/'+name+'\/+([a-zA-Z0-9\-\_\.!@#$%^&*]+)$', 'i'); // NO g JUST i
	app.post.simple(regex, function(request, response, mysql){
		var key = request.params[1];
		var options = configure(request, response, key);
		upload.load(request, response, options);
	}, true); // MySQL must be disabled if Upload Streaming is enabled
	
	// REGISTER content result path
	var regex = new RegExp('^\/upload\/contents\/'+name+'\/+([a-zA-Z0-9\-\_\.!@#$%^&*]+)$', 'i');
	app.post.simple(regex, function(request, response, mysql){
		var key = request.params[1];
		
		response.end(JSON.stringify(upload.contents[name][key]));
		
		// REMOVE contents from memory
		delete upload.contents[name][key];
		
		// REMOVE the upload key from memory
		keys.remove(key);
	}, true);
}

// Avatar Uploading
upload.listener('avatar', function(request, response, key){ return {
	path 		: 'uploads/avatars/',
	log			: app.path + '/logs/uploads/avatars.log',
	size_total	: 3, // MB 
	size_each	: 3, // MB 
	key			: key,
	mime		: ['image/png', 'image/gif', 'image/jpg', 'image/jpeg'],
	commands	: {
		'images' : {
			thumbnail : { 
				path   : 'uploads/avatars/',
				width  : 64,
				height : 64
			}
		},
	},
	end: function(request, response, errors, fields, files, mysql){
		// The avatar is the first file in the files list
		var avatar = files[0];
		response.setHeader("Content-Type", "text/plain");
		
		// REMOVE the upload key
		keys.remove(key);
		
		// INSERT avatar into the database
		mysql('INSERT INTO avatars (owner, name, path, mime, size) '
			+ 'VALUES ('+ request.cookies.id  + ', "'
						+ sanitize(avatar.name) + '", "'
						+ sanitize(avatar.path) + '", "'
						+ sanitize(avatar.mime) + '", '
						+ avatar.size
			+')', 
		function(rows, onerror){
			onerror('error on upload.js - upload avatar error!');
			response.end(JSON.stringify(files));
			request.mysql_close();
		});
	}

}});
```
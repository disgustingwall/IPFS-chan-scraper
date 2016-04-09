var express;
var ipfsAPI;
var fs;
var mkdirp;
var http;
var https;
var bodyParser;
var multer;



var app;
var ipfs;


//control to fill mailboxCreationTimes up with dummy values at startup to increase refresh rate or not
var startQuick = false;

//track when emergency refreshes are allowed to prevent minting in /uploaded from triggering multiple times
var lastMailboxRefresh = 0;

var newestMailbox = "";

//list of peer sites
var postsToMerge = [];
var mailboxesToMerge = [];
var mailboxCreationTimes = [];
//blank entries are to give the site respite if it has itself in its array
var peerSitesList = ["https://ipfschan.herokuapp.com"];

function isEmpty(obj)
{
	for(var prop in obj)
	{
		if(obj.hasOwnProperty(prop))
		{
			return false;
		}
	}
	return true;
}

function writeIfNotExist(file, content, callback, callbackParmeterObject)
{
	if (!callback)
	{
		callback = function () {};
	}
	if (!callbackParmeterObject)
	{
		callbackParmeterObject = {};
	}
	
	fs.exists(file, function(exists) {
		if (!exists)
		{
			if (!content)
			{
				content = "";
			}
			
			mkdirp(file.replace(/(\/.*\/).*/, "$1"), function (err) {
				if (err)
				{
					//TODO: handle failure
					callback(callbackParmeterObject);
					
					console.log(err);
				}
				
				fs.writeFile(file, content, function (err) {
					if (err)
					{
						//TODO: handle failure
						callback(callbackParmeterObject);
						
						console.log(err);
					}
					
					callback(callbackParmeterObject);
				});
			});
		}
		else
		{
			callback(callbackParmeterObject);
		}
	});
}

function cleanMailboxCreationTimes(callback)
{
	var currentTime = Date.now();
	while(mailboxCreationTimes[0] < currentTime - (60 * 60 * 1000))
	{
		mailboxCreationTimes.splice(0, 1);
	}
	
	callback();
}

function refreshMailboxResponse (response)
{
	var str = '';
	
	//another chunk of data has been recieved, so append it to `str`
	response.on('data', function (chunk) {
		str += chunk;
	});
	
	//the whole response has been recieved, so we just print it out here
	response.on('end', function () {
		console.log("string received from foreign host: " + str);
		
		//TODO: only process if foreignNewest is actually new (foreign site is active)
		
		//if foreignNewest is really an IPFS hash
		//TODO: better checking
		if (str.length === 46)
		{
			mailboxesToMerge[mailboxesToMerge.length] = str;
		}
		else
		{
			console.log("invalid IPFS hash received from foreign host");
			//TODO: add a failure to a list for this host and reorganize the list to put sites with the largest number of bad responses at the end
			//TODO: scrape result for new URLs
		}
	});
}

function refreshMailbox(site)
{
	var protocol = http;
	
	try
	{
		var siteMatches = site.match(/(((https?:\/\/)?(([\da-z\.-]+)\.?([a-z\.]{2,6})?))(:(\d+))?)([\/\w \.-]*)*\/?/);
	}
	catch (e)
	{
		console.log(e);
	}
	
	if (siteMatches)
	{
		if (siteMatches[3] === "https://" || siteMatches[8] === "443")
		{
			console.log("using https");
			protocol = https;
		}
	}
	
	if (site)
	{
		console.log(site);
		
		try
		{
			var req = protocol.request(site + "/newest", refreshMailboxResponse);
			req.on('error', function(err) {
				console.log(err);
			});
			req.end();
		}
		catch (e)
		{
			console.log(e);
		}
	}
	else
	{
		//console.log("respite...");
	}
}

function refreshPeerSite(currentPeerSite)
{
	if (!currentPeerSite)
	{
		currentPeerSite = 0;
	}
	
	cleanMailboxCreationTimes(function(){
		if (currentPeerSite >= peerSitesList.length || currentPeerSite < 0)
		{
			currentPeerSite = 0;
		}
		
		
		if (peerSitesList.length > 0)
		{
			refreshMailbox(peerSitesList[currentPeerSite]);
		}
		
		//devided by 2 to be twice as fast
		var delay = Math.floor(((60 * (5 / (mailboxCreationTimes.length + 1))) / 10) + 1) * 10 * 1000 / 2;
		
		setTimeout(refreshPeerSite, delay, currentPeerSite + 1);
	});
}

function createMailboxCallback()
{
	//only run if there is something to commit
	if (mailboxesToMerge.length !== 0 || postsToMerge.length !== 0)
	{
		var newMailboxJSON = {};
		var oldMailbox = newestMailbox.toString();
		
		
		//if there are no new mailboxes, don't include an ["o"] entry (this is mostly for startup when there is no newest mailbox)
		//TODO: check if this mailbox chain gets to new posts before getting back to all previously included mailboxes
		if (mailboxesToMerge.length > 0 || oldMailbox)
		{
			newMailboxJSON["o"] = mailboxesToMerge;
			mailboxesToMerge = [];
			
			if (oldMailbox)
			{
				newMailboxJSON["o"][newMailboxJSON["o"].length] = oldMailbox;
			}
			
			//remove duplicates
			newMailboxJSON["o"] = newMailboxJSON["o"].filter(function(element, position, array) {
				return array.indexOf(element) === position;
			});
			
			if (newMailboxJSON["o"].length <= 0)
			{
				delete newMailboxJSON["o"];
			}
		}
		
		if (postsToMerge.length > 0)
		{
			newMailboxJSON["n"] = postsToMerge;
			
			postsToMerge = [];
			
			//remove duplicates
			newMailboxJSON["n"] = newMailboxJSON["n"].filter(function(element, position, array) {
				return array.indexOf(element) === position;
			});
			
			if (newMailboxJSON["n"].length <= 0)
			{
				delete newMailboxJSON["n"];
			}
		}
		
		//only mint new if there are new posts or a merged chain
		if ((newMailboxJSON.hasOwnProperty("n") && newMailboxJSON["n"].length > 0) || (newMailboxJSON.hasOwnProperty("o") && newMailboxJSON["o"].length > 1))
		{
			var newMailbox = JSON.stringify(newMailboxJSON).toString();
			
			
			console.log(newMailbox);
			
			
			ipfs.add(new Buffer(newMailbox.toString()), function(err, res) {
				if(err || !res)
				{
					return console.error(err);
				}
				
				var mailboxResponse = res;
				
				
				mailboxResponse.forEach(function(element, elementNumber) {
					//store new mailbox hash in core directory
					newestMailbox = element.Hash.toString();
					
					//push to IPFS node
					publishMailboxPush();
					
					//write to file to restore on restart
					writeIfNotExist("/tmp/IPFSchan/mailbox/newest/newest.txt", "", function(){
						fs.writeFile("/tmp/IPFSchan/mailbox/newest/newest.txt", newestMailbox, function (err) {
							if (err)
							{
								console.log(err);
							}
						});
					});
					
					var currentTime = Date.now();
					
					mailboxCreationTimes[mailboxCreationTimes.length] = currentTime;
				});
			});
		}
	}
}

function createMailbox()
{
	//clean mailboxCreationTimes
	cleanMailboxCreationTimes(function(){
		createMailboxCallback();
		
		//create new mailbox faster if there are many messages, slower if there are few
		//aiming at 1 every minute, looking over 60 minutes
		//(one minute in miliseconds * (60 / (number of mailboxes in the last hour + 60))) + 10 seconds
		var delay = Math.floor(((60 * (5 / (mailboxCreationTimes.length + 1))) / 10) + 1) * 10 * 1000;
		
		
		setTimeout(createMailbox, delay);
	});
}

function shouldItBeFile(data, htmlResponse, htmlRequest)
{
	var htmlUrlInfo = htmlRequest.originalUrl.toString().match(/(\/ipfs\/(\w{46}))([\.](\w*))?/);
	
	//no file extensions - just serve it
	if (!htmlUrlInfo || !htmlUrlInfo[3])
	{
		htmlResponse.end(data.toString());
	}
	else
	//has a dot, but nothing else
	if (htmlUrlInfo[3] !== "" && htmlUrlInfo[4] === "")
	{
		htmlResponse.writeHead(302, {'Location': 'http://' + htmlRequest.get('host') + htmlUrlInfo[1]});
		htmlResponse.end();
	}
	else
	{
		var testing = false;
		var isExtremelyBlocking = true;
		
		if (testing || !isExtremelyBlocking)
		{
			var dataInfo = data.match(/data:(.+\/(.+));base64,(.*)/);
			
			if (!dataInfo)
			{
				htmlResponse.end(data);
			}
			else
			{
				if (htmlUrlInfo[4] === dataInfo[2])
				{
					//create buffer with encoded file
					var buffer = new Buffer(dataInfo[3], 'base64');
					
					//this only creates a form of stream, not a full file download
					htmlResponse.writeHead(200, {'Content-Length': buffer.length, 'Content-Type': dataInfo[1]});
					htmlResponse.end(buffer);
				}
				else
				{
					htmlResponse.writeHead(302, {'Location': 'http://' + htmlRequest.get('host') + htmlUrlInfo[1] + "." + dataInfo[2]});
					htmlResponse.end();
				}
			}
		}
		else
		{
			htmlResponse.writeHead(302, {'Location': 'http://' + htmlRequest.get('host') + htmlUrlInfo[1]});
			htmlResponse.end();
		}
	}
}

function maybeAddAsNewest (data)
{
	if (data.toString().length === 46)
	{
		if (!newestMailbox)
		{
			newestMailbox = data.toString();
		}
		else
		{
			mailboxesToMerge[mailboxesToMerge.length] = data.toString();
		}
	}
	
	console.log("newestMailbox: " + newestMailbox);
	console.log("JSON.stringify(mailboxesToMerge) " + JSON.stringify(mailboxesToMerge));
}

function addToPeerSites(newArr)
{
	var tempArr = peerSitesList;
	
	for(var i = 0; i < newArr.length; i++)
	{
		tempArr[tempArr.length] = newArr[i];
	}
	
	//remove duplicates
	tempArr = tempArr.filter(function(element, position, array) {
		return array.indexOf(element) === position;
	});
	
	//remove blanks
	tempArr = tempArr.filter(function(element, position, array) {
		if (element.length === 0)
		{
			return false;
		}
		return true;
	});
	
	peerSitesList = tempArr;
}

function publishMailboxPull(callback)
{
	var addResultToLists = false;
	
	if (!callback)
	{
		callback = function(){};
		addResultToLists = true;
	}
	
	var publishedObject = {};
	
	var finishPublish = function (str, callback){
		try
		{
			publishedObject = JSON.parse(str);
			
			if (addResultToLists)
			{
				maybeAddAsNewest(publishedObject["IPFSchan"]["newestMailbox"]);
				addToPeerSites(publishedObject["IPFSchan"]["peerSites"]);
			}
		}
		catch (e)
		{
			console.log(e);
		}
		
		callback(publishedObject);
	};
	
	ipfs.id(function(err, res){
		if (err)
		{
			return console.log(err);
		}
		
		var IDresponse = res;
		
		console.log("response ID: " + res["ID"]);
		
		
		ipfs.name.resolve(IDresponse["ID"], function(err, res){
			if (err)
			{
				callback(publishedObject);
				return console.log(err);
			}
			
			console.log(res);
			
			if (res["Path"])
			{
				ipfs.cat(res["Path"], function (err, res){
					if(err || !res)
					{
						callback(publishedObject);
						return console.error(err);
					}
					
					if(res.readable) {
						// Returned as a stream
						// Returned as a stream
						var string = '';
						res.on('data', function(chunk) {
							string += chunk;
						});
						
						res.on('end', function() {
							finishPublish(string, callback);
						});
					}
					else
					{
						// Returned as a string
						finishPublish(res, callback);
					}
				});
			}
		});
	});
}

function publishMailboxPush()
{
	//pull current object to preserve unrelated information
	publishMailboxPull(function(publishedObject){
		if (!publishedObject)
		{
			publishedObject = {};
		}
		
		var publishObject = publishedObject;
		
		publishObject["IPFSchan"] = {};
		
		publishObject["IPFSchan"]["newestMailbox"] = newestMailbox;
		publishObject["IPFSchan"]["peerSites"] = peerSitesList.filter(function(element, position, array){
			return array.indexOf(element) === position;
		}).filter(function(element, position, array){
			return !(element === "");
		});
		
		ipfs.add(new Buffer(JSON.stringify(publishObject).toString()), function(err, res) {
			if(err || !res)
			{
				return console.error(err);
			}
			
			
			res.forEach(function(text, textNumber) {
				ipfs.name.publish(text["Hash"], function(err, res){
					if (err)
					{
						return console.log(err);
					}
					
					console.log("published object: " + JSON.stringify(res));
				});
			});
		});
	});
}

function main()
{
	var cfgContents = "";
	var cfgObject = {};
	
	express = require('express');
	ipfsAPI = require('ipfs-api');
	fs = require('fs');
	mkdirp = require("mkdir-p");
	http = require('http');
	https = require('https');
	bodyParser = require('body-parser');
	multer = require('multer');
	
	
	//fill mailboxCreationTimes with dummy values to create baseline
	var currentTime = Date.now();
	//only if global variable is set
	if (startQuick)
	{
		for (var i = 0; i < 60; i++)
		{
			mailboxCreationTimes[mailboxCreationTimes.length] = currentTime + i * 60 * 1000;
		}
	}
	
	
	//fill cfgObject with defaults
	if (!cfgObject.hasOwnProperty("ipfsAPI"))
	{
		cfgObject["ipfsAPI"] = {};
	}
	
	if (!cfgObject["ipfsAPI"].hasOwnProperty("domain") || cfgObject["ipfsAPI"]["domain"] === "")
	{
		cfgObject["ipfsAPI"]["domain"] = "localhost";
	}
	
	if (!cfgObject["ipfsAPI"].hasOwnProperty("port")  || cfgObject["ipfsAPI"]["port"] === "")
	{
		cfgObject["ipfsAPI"]["port"] = "5001";
	}
	
	if (!cfgObject["ipfsAPI"].hasOwnProperty("options"))
	{
		cfgObject["ipfsAPI"]["options"] = {protocol: 'http'};
	}
	
	
	
	//set values from environment vars
	//for if the ipfs node is behind tor
	if (process.env.IPFSserviceID && process.env.IPFStorMirrorDomain)
	{
		cfgObject["ipfsAPI"]["domain"] = (process.env.IPFSserviceID + "." + process.env.IPFSdomain);
	}
	
	//for if the ipfs node is at an IP
	if (process.env.IPFSip)
	{
		cfgObject["ipfsAPI"]["domain"] = process.env.IPFSip;
	}
	
	//if there is a hostname for the IPFS node
	if (process.env.IPFShostname)
	{
		cfgObject["ipfsAPI"]["domain"] = process.env.IPFShostname;
	}
	
	if (process.env.IPFSport)
	{
		cfgObject["ipfsAPI"]["port"] = process.env.IPFSport;
	}
	
	if (process.env.IPFSoptions)
	{
		cfgObject["ipfsAPI"]["options"] = JSON.parse(process.env.IPFSoptions);
	}
	
	
	console.log("final config object: " + JSON.stringify(cfgObject));
	
	
	fs.readFile("/tmp/IPFSchan/mailbox/newest/newest.txt", function (err, data) {
		if (err)
		{
			console.log("Error reading file that stores initial mailbox");
			return console.log(err);
		}
		maybeAddAsNewest(data.toString());
		console.log("newestMailbox: " + newestMailbox);
	});
	
	
	app = express();
	ipfs = ipfsAPI(cfgObject["ipfsAPI"]["domain"], cfgObject["ipfsAPI"]["port"], cfgObject["ipfsAPI"]["options"]);
	
	
	publishMailboxPull();
	
	
	//add at least one post (only the empty hash) so that /newest always has content
	postsToMerge[postsToMerge.length] = "QmbFMke1KXqnYyBBWxB74N4c5SBnJMVAiMNRcGu6x1AwQH";
	
	if (lastMailboxRefresh < Date.now())
	{
		lastMailboxRefresh = Date.now() + 10 * 1000
		setTimeout(createMailboxCallback, 10 * 1000);
	}
	
	
	
	//start auto-refresh from peer sites
	refreshPeerSite();
	//start creating mailboxes
	createMailbox();
	
	
	
	app.set('port', (process.env.PORT || 12462));
	
	app.use(bodyParser.json());
	app.use(bodyParser.urlencoded({ extended: true }));
	
	
	var upload = multer();
	
	app.post('/uploaded', upload.array(), function(req, res, next) {
		console.log(req.body);
		console.log(JSON.stringify(req.body.postText));
		
		var htmlRequest = req;
		var htmlResponse = res;
		
		var responseObject = {};
		
		
		if (htmlRequest.headers.origin)
		{
			if (!(htmlRequest.headers.origin === ""))
			{
				//TODO: check if origin is spamming, in which case don't add this header or deny the request
				htmlResponse.setHeader('Access-Control-Allow-Origin', htmlRequest.headers.origin);
			}
		}
		
		
		//compile postText and add to IPFS
		var postText = "";
		
		if (htmlRequest.body.postText)
		{
			postText = postText + htmlRequest.body.postText;
		}
		
		//scrape postText for URLs and add them to peerSitesList
		//TODO: better URL regex
		newURLmatch = postText.match(/(((https?:\/\/)?(([\da-z\.-]+)\.([a-z\.]{2,6})))(:(\d+))?)([\/\w \.-]*)*\/?/g);
		
		if (newURLmatch)
		{
			newURLmatch.forEach(function(site, siteNumber) {
				var siteNormalized = site.replace(/(((https?:\/\/)?(([\da-z\.-]+)\.([a-z\.]{2,6})))(:(\d+))?)([\/\w \.-]*)*\/?/, "$1");
				var protocol = "";
				
				siteNormalizedMatches = siteNormalized.match(/(((https?:\/\/)?(([\da-z\.-]+)\.([a-z\.]{2,6})))(:(\d+))?)([\/\w \.-]*)*\/?/);
				
				if (siteNormalizedMatches[3] !== "https://" && siteNormalizedMatches[3] !== "http://")
				{
					siteNormalized = "http://" + siteNormalized;
				}
				
				peerSitesList[peerSitesList.length] = siteNormalized;
			});
			
			//remove duplicates
			peerSitesList = peerSitesList.filter(function(element, position, array) {
				return array.indexOf(element) === position;
			});
			
			console.log(JSON.stringify(peerSitesList));
		}
		
		
		ipfs.add(new Buffer(postText.toString()), function(err, res) {
			if(err || !res)
			{
				responseObject["err"] = "Error adding post text to IPFS";
				
				htmlResponse.end(JSON.stringify(responseObject));
				
				//TODO: save text for later upload
				
				return console.error(err);
			}
			
			
			var textResponseArray = [];
			
			var textResponse = res;
			
			
			textResponse.forEach(function(text, textNumber) {
				postsToMerge[postsToMerge.length] = text["Hash"];
				responseObject["t"] = text["Hash"];
			});
			
			
			
			htmlResponse.end(JSON.stringify(responseObject));
			
			
			if (lastMailboxRefresh < Date.now())
			{
				lastMailboxRefresh = Date.now() + 10 * 1000
				//temporarily step up refresh mailbox rate temporarily to get new posts into circulation
				setTimeout(createMailboxCallback, 10 * 1000);
			}
		});
		
	});
	
	app.get('/upload.html', function(req, res) {
		//TODO: add upload.html to IPFS occasionally and store hash to redirect to
		res.sendFile(__dirname + "/upload.html");
	});
	
	app.get(/upload/, function(req, res) {
		res.writeHead(302, {
			'Location': 'http://' + req.get('host') + '/upload.html'
			//add other headers here...
		});
		res.end();
	});
	
	app.get(/newest/, function(request, response) {
		if (request.headers.origin)
		{
			if (!(request.headers.origin === ""))
			{
				//TODO: check if origin is spamming, in which case don't add this header or deny the request
				response.setHeader('Access-Control-Allow-Origin', request.headers.origin);
			}
		}
		
		response.end(newestMailbox.toString());
	});
	
	app.get(/ipfs\/(.*)/, function(request, response) {
		var htmlResponse = response;
		var htmlRequest = request;
		
		//second regex is to find if there are still slashes remaining, meaning the regex should have failed
		var requestedHash = htmlRequest.originalUrl.toString().replace(/\/ipfs\/([\w]{46})(.*)/, "$1").replace(/.*(\/).*/, "$1");
		
		if (requestedHash.length !== 46)
		{
			if (requestedHash.length < 46)
			{
				htmlResponse.end("<html><body><p>that IPFS hash identifier probably is too short</p></body></html>");
			}
			else
			if (requestedHash.length > 46)
			{
				htmlResponse.end("<html><body><p>that IPFS hash identifier is too long</p></body></html>");
			}
			else
			{
				htmlResponse.end("<html><body><p>that IPFS hash identifier is invalid</p></body></html>");
			}
		}
		else
		{
			ipfs.cat(requestedHash, function(err, res) {
				if(err || !res)
				{
					htmlResponse.end("<html><body><p>sorry, something went wrong. It's possible that no known IPFS nodes are up, in which case it would be impossible for your file to be served from this site</p></body></html>");
					return console.error(err);
				}
				
				if(res.readable)
				{
					// Returned as a stream
					var string = '';
					res.on('data', function(chunk) {
						string += chunk;
					});
					
					res.on('end', function() {
						shouldItBeFile(string, htmlResponse, htmlRequest);
					});
				}
				else
				{
					// Returned as a string
					shouldItBeFile(res, htmlResponse, htmlRequest);
				}
			});
		}
	});
	
	app.get(/player/, function(req, res) {
		//TODO: redirect to IPFS hash
		//TODO: re-add player.html occasionally and store hash to redirect to
		res.sendFile(__dirname + "/player.html");
	});
	
	app.get(/.*/, function(req, res) {
		//TODO: add index.html to ipfs and redirect client to that object
		res.writeHead(302, {
			'Location': 'http://' + req.get('host') + '/ipfs/QmVADhzxKusgYiDh3W2DEzbdzVsoRwKFma2oQs1NUhVbTo'
			//add other headers here...
		});
		
		//TODO: just write something so that onion.city works
		
		res.end();
	});
	
	app.get(/boop/, function(request, response) {
		response.end("boop");
	});
	
	app.listen(app.get('port'), function() {
		console.log('Node app is running on port', app.get('port'));
	});
}


main();

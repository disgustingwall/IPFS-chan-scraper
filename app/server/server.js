var http;
var https;
var ipfsAPI;
var express;
var fs;
var mkdirp;


var app;
var ipfs;


var newestMailbox = "";

var mailboxesToMerge = [];
var mailboxes = [];

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

function createMailboxCallback()
{
	//clean mailboxesToMerge of mailboxes created by this server
	//this will prevent mailboxes downloaded from yourself from being re-added
	for (var i = 0; i < mailboxesToMerge.length; i++)
	{
		if (mailboxes.indexOf(mailboxesToMerge[i]) !== -1)
		{
			mailboxesToMerge.splice(i, 1);
		}
	}
	
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
				newMailboxJSON["o"].push(oldMailbox);
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
					
					mailboxes.push(newestMailbox);
					
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
					
					mailboxCreationTimes.push(currentTime);
				});
			});
		}
	}
}

//TODO: create functions for refreshing each type of object (index, catalog, thread)
function createMailbox()
{
	//10 seconds in miliseconds
	var delay = 10 * 1000;
	
	return setTimeout(createMailbox, delay);
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
			mailboxesToMerge.push(data.toString());
		}
	}
	
	console.log("newestMailbox: " + newestMailbox);
	console.log("JSON.stringify(mailboxesToMerge) " + JSON.stringify(mailboxesToMerge));
}

//TODO: rename
//TODO: change target from ipfschan to ipfs-chan-scraper
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

//TODO: rename
//TODO: change ipfschan to ipfs-chan-scraper
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
	
	
	
	app = express();
	ipfs = ipfsAPI(cfgObject["ipfsAPI"]["domain"], cfgObject["ipfsAPI"]["port"], cfgObject["ipfsAPI"]["options"]);
	
	
	publishMailboxPull();
	
	//TODO: global refresh queue
		//assume that there have been 100 refreshes
		//subtract current average time from actual refresh time. this will result in a positive number if the page took longer than average to get new content, and negative if it took shorter than average to get new content
		//devide the result by 100
		//add the result to the current average time, and set that as the new average time
		//have a default value to start out with
		//after a page is refreshed, add that page to the end of the queue with a target time of the current time plus the average refresh time, passed through the Math.ceil function with the current time plus one second for non-threads and the current time plus ten seconds for threads
		//sort the list
			//sort the list such that all elements below the midpoint are greater than the midpoint's time, and all elements above the midpoint are less than the midpoint's time. this can be acheived by comparing the lowest element with the midpoint and either leaving it where it is or moving it above the midpoint
			//sort the top 50%, rounded up, of the list
			//sort the top 25%...
			//sort the top 32, 16, 8, 4, 2
			//refresh the top
	
	//TODO: function that pulls index JSON and compares it to previous JSON
		//global object with each site as an element
		//each site is an object with refresh frequency (which is the min of each board's refresh frequency) and each board as an element
		//each board is an object with refresh frequency index, catalog, and threads as elements
		//INDEX
			//index is an array of JSON objects
			//refresh site/board/1.json
			//compare received json and old json
			//if old[0]["threads"][0] and new["threads"][0] are not equal, mark index 1 to be refreshed
			//compare old[0]["threads"][0] and new["threads"][1]. if they are not equal, compare to new["threads"][2], etc
			//if the thread that was first in old[0] is still on index page 1, skip the next indented section
			//if the thread is not still on index page 1, 
				//refresh index page 2
				//compare the old first thread to each thread in index 2
				//if any new content is found, mark page 2 to be refreshed
				//continue moving on and marking index pages until you find the old first thread or receive a 404 error
			//refresh the index pages that have been found to have new content
			//store new thread numbers
			//calculate their differences with the old content
			//store the new merkle trees / deltas
			//move on to the next page type
		//CATALOG
			//catalog is a JSON object
			//refresh the catalog
			//store new thread numbers
			//calculate the differences with the old content
			//store the new merkle tree / delta (if any)
			//move on to the next page type
		//THREADS
			//a thread is a string of HTML
			//refresh the thread page
			//calculate the differences with the old content
			//store the new merkle tree / delta (if any)
			//move on to the next board/site
	
	
	
	
	app.set('port', (process.env.PORT || 12462));
	
	
	
	
	
	
	
	app.get(/newest/, function(request, response) {
		if (request.headers.origin)
		{
			if (!(request.headers.origin === ""))
			{
				//TODO: check if origin is spamming, in which case don't add this header or deny the request
				response.setHeader('Access-Control-Allow-Origin', request.headers.origin);
			}
		}
		
		//add at least one post (only the empty hash) so that /newest always has content
		postsToMerge.push("QmbFMke1KXqnYyBBWxB74N4c5SBnJMVAiMNRcGu6x1AwQH");
		
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
						htmlResponse.end(string.toString());
					});
				}
				else
				{
					// Returned as a string
					htmlResponse.end(res.toString());
				}
			});
		}
	});
	
	app.get(/.*/, function(req, res) {
		var HTMLrequest = req;
		var HTMLresponse = res;
		
		
		//add index.html to ipfs and redirect client to that object
		fs.readFile(__dirname + "/../client/index.html", function (err, data) {
			if (err)
			{
				console.log("Error reading index.html");
				
				HTMLresponse.writeHead(500);
				
				//TODO: just write something so that onion.city works
				//TODO: does the empty string count?
				HTMLresponse.end("Sorry, but the index page cannot be found. This is an internal server error due to a file being unreadable or not present");
				
				return console.log(err);
			}
			
			ipfs.add(new Buffer(data.toString()), function(err, res) {
				if(err || !res)
				{
					console.log("error adding index.html to IPFS");
					
					HTMLresponse.writeHead(500);
					
					//TODO: just write something so that onion.city works
					//TODO: does the empty string count?
					HTMLresponse.end("Sorry, but something seems to be wrong with the index page or my IPFS connection. This is an internal server error due to a file being unreadable or not present");
					
					return console.error(err);
				}
				
				var IPFSResponse = res;
				
				
				return IPFSResponse.forEach(function(element, elementNumber) {
					console.log("redirecting index to " + "/ipfs/" + element.Hash.toString());
					
					HTMLresponse.writeHead(302, {
						'Location': 'http://' + req.get('host') + '/ipfs/' + element.Hash.toString()
						//add other headers here...
					});
					
					//TODO: just write something so that onion.city works
					//TODO: does the empty string count?
					return HTMLresponse.end("");
				});
			});
		});
	});
	
	app.get(/boop/, function(request, response) {
		response.end("boop");
	});
	
	app.listen(app.get('port'), function() {
		console.log('Node app is running on port', app.get('port'));
	});
}


main();

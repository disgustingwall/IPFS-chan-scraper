# IPFSchan
Distributed messageboard


Usage:

IPFSchan can be used at several different levels: user, archivalist, or server operator. Each usage level builds on the last, and every step you take makes you a more effective user. 

Level 1: User

The very act of using IPFSchan is helpful. Files are served through the IPFS network, meaning they are backed up on the server the client is using, the server where the content was posted, and every node that connects the two. 
This level of usage doesn't require any technical skills. Simply access a functioning server (such as https://ipfschan.herokuapp.com) and browse to your heart's content. Everything you view is automatically backed up on the IPFS network. 


Level 2: Archivalist

This level of usage requires some technical know-how, but not much. 

Since all content is stored on nodes of the IPFS network, setting up your own node and using it for browsing allows you to save the content you view to your own computer automatically. 
To set up your own node, go to https://ipfs.io/docs/install/ and install an IPFS node on your computer. The correct choice for you depends on your operating system and trust level of precompiled binaries, but I personally use the precompiled 64 bit linux binary. Installation instructions should be on the download page and in the file you download. 
Once you've installed an IPFS node, start it up. on linux, this is done through running the command "ipfs daemon" on a terminal. 
You may be prompted to initialize your IPFS cache if you have recently installed IPFS or something has gone wrong. Know that this is fine as long as you have never loaded any content through IPFS, but doing so while you have content stored locally will delete it permanently! 

Once you have set up your IPFS node and have it running, navigate to a functioning server (such as https://ipfschan.herokuapp.com). Once the page loads, change the domain to "localhost:8080". If your IPFS node is set up correctly, the page should reload after a delay and should look exactly the same. Now when you view a post, it will be downloaded directly to your computer and saved there. 

Your web browser will still query for new content directly from another server, but the content you view is saved on your own machine, meaning it is safe from network problems or deletion. 
Note that IPFS sometimes cleans its cache of content that hasn't been accessed recently as the cache grows. This is normal behavior, but be aware that your local archive is not permanent. If you want to permanently archive your data, you must take extra steps to make backups of your IPFS cache or save content you find interesting. 


Level 3: Server Operator

This level of usage has more significant setup time, but the main requirements are still rather easy to set up. 

Running a server means that you can submit new content to IPFSchan without using an outside server, that content will be compiled into blocks automatically, and references to those blocks will be copied and hosted on other servers. 

The server software is located at bin/server/server.js in this repository. To run this file, you must install nodeJS and update it to version 4.0 or greater. 
To run the server on linux, run the command `node ./bin/server/server.js` from a terminal where the current directory is the IPFSchan project's root folder. This will start the server, available at http://localhost:12462

However, there are additional setup steps required at this point. Mainly, you must tell your server of a functioning IPFS node to use. If you have set up an IPFS node in level 2 above on the same machine as the server, that will work without extra configuration. If you have a node set up on another server, you will need to set the environment variables "IPFShostname" or "IPFSip", and "IPFSport". IPFSport should probably be 5001, but IPFShostname or IPFSip need to be the hostname or ip of your IPFS node that is accessible by your server. For example, your IPFSip setting might be "99.220.127.42" if that were the ip of your IPFS node, or "mynode.example.org" if you're using a DNS service, or some other configuration that resolves to an ip. To do this one a single line, enter the following command with your own information included: `IPFSip=192.168.1.32 IPFSport=5001 node ./bin/server/server.js`

This will allow you to post to the IPFS network, but it will not allow your server to find content posted from other servers, and it will not allow other servers to find the content you post. In order to accomplish this, you must post your server's address on other servers, and vice versa. However, this is not done through the normal posting page, as all content posted through the index.html file in this repository is encrypted and unreadable by the server. To tell your server to pull from another server, navigate to http://localhost:12462/upload.html and enter the foreign server's address. upload.html doesn't encrypt any content, so anything you post can be read by the server. 


On your local server's upload.html page, enter the foreign server's URL like so: https://ipfschan.herokuapp.com (including the protocol)


Do the same on the foreign server you want to pull from your server: go to the server's upload.html page, and in the text box enter your server's publicly available hostname or ip, including any port requirements (other than port 80), like so: http://99.220.127.42:8080


The two servers should now pull blocks from each other periodically and merge their content listings. 

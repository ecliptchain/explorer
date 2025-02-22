const mongoose = require('mongoose'),
	lib = require('../lib/explorer'),
	db = require('../lib/database'),
	settings = require('../lib/settings'),
	axios = require('axios');

function exit()
{
	mongoose.disconnect();
	process.exit(0);
}

let dbString = 'mongodb://' + settings.dbsettings.user +
	':' + settings.dbsettings.password +
	'@' + settings.dbsettings.address +
	':' + settings.dbsettings.port +
	'/' + settings.dbsettings.database;

mongoose.connect(dbString, function (err)
{
	if (err)
	{
		console.log('Unable to connect to database: %s', dbString);
		console.log('Aborting');
		exit();
	}
	else
	{
		axios.get('http://127.0.0.1:' + settings.port + '/api/getpeerinfo')
			.then(response =>
			{
				let peers = response.data;
				lib.syncLoop(peers.length, function (loop)
				{
					let i = loop.iteration();
					let addr = peers[i].addr;
					let portSplit = addr.lastIndexOf(":");
					let port = "";
					if (portSplit < 0)
					{
						portSplit = addr.length;
					}
					else
					{
						port = addr.substring(portSplit + 1);
					}
					let address = addr.substring(0, portSplit);
					db.find_peer(address, function (peer)
					{
						if (peer)
						{
							if (isNaN(peer['port']) || peer['port'].toString().length < 2 ||
								!peer['country'] || !peer['country_code'])
							{
								db.drop_peers(function ()
								{
									console.log('Saved peers missing ports or country, dropping peers. Re-run this script afterwards.');
									exit();
								});
							}
							else
							{
								loop.next();
							}
						}
						else
						{
							axios.get('https://reallyfreegeoip.org/json/' + address)
								.then(geoResponse =>
								{
									let geo = geoResponse.data;
									db.create_peer({
										address: address,
										port: port,
										protocol: peers[i].version,
										version: peers[i].subver.replace(/\//g, ''),
										country: geo.country_name,
										country_code: geo.country_code
									}, function ()
									{
										loop.next();
									});
								})
								.catch(err =>
								{
									console.error('Geo lookup error:', err);
									loop.next();
								});
						}
					});
				}, function ()
				{
					exit();
				});
			})
			.catch(err =>
			{
				console.error('Error fetching peer info:', err);
				exit();
			});
	}
});

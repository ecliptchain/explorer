const mongoose = require('mongoose'),
	lib = require('../lib/explorer'),
	db = require('../lib/database'),
	settings = require('../lib/settings'),
	axios = require('axios');

function exit()
{
	process.exit(0);
}

const dbString = 'mongodb://' + settings.dbsettings.user +
	':' + settings.dbsettings.password +
	'@' + settings.dbsettings.address +
	':' + settings.dbsettings.port +
	'/' + settings.dbsettings.database;

mongoose.connect(dbString)
	.then(() =>
	{
		axios.get('http://127.0.0.1:' + settings.port + '/api/getpeerinfo')
			.then(response =>
			{
				const body = response.data;
				lib.syncLoop(body.length, function (loop)
				{
					if (typeof body !== 'object')
					{
						throw new Error(body);
					}

					const i = loop.iteration();
					let portSplit = body[i].addr.lastIndexOf(":");
					let port = "";
					if (portSplit < 0)
					{
						portSplit = body[i].addr.length;
					}
					else
					{
						port = body[i].addr.substring(portSplit + 1);
					}

					const address = body[i].addr.substring(0, portSplit);
					db.find_peer(address, function (peer)
					{
						if (peer)
						{
							if (isNaN(peer['port']) || peer['port'].length < 2 || peer['country'].length < 1 || peer['country_code'].length < 1)
							{
								db.drop_peers(function ()
								{
									console.log('Saved peers missing ports or country, dropping peers. Re-run this script afterwards.');
									exit();
								});
							}
							// peer already exists, continue looping
							loop.next();
						}
						else
						{
							axios.get('https://reallyfreegeoip.org/json/' + address)
								.then(responseGeo =>
								{
									const geo = responseGeo.data;
									db.create_peer({
										address: address,
										port: port,
										protocol: body[i].version,
										version: body[i].subver.replace('/', '').replace('/', ''),
										country: geo.country_name,
										country_code: geo.country_code
									}, function ()
									{
										loop.next();
									});
								})
								.catch(error =>
								{
									console.error('Error getting geo data:', error.message);
									loop.next();
								});
						}
					});
				}, function ()
				{
					exit();
				});
			})
			.catch(error =>
			{
				console.error('Error getting peer info:', error.message);
				exit();
			});
	})
	.catch(err =>
	{
		console.log('Unable to connect to database: %s, error: %s', dbString, err);
		console.log('Aborting');
		exit();
	});

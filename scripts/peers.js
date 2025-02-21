const mongoose = require('mongoose'),
	lib = require('../lib/explorer'),
	db = require('../lib/database'),
	settings = require('../lib/settings'),
	axios = require('axios');

mongoose.connection.on('error', (err) =>
{
	console.error('Mongoose connection error:', err);
});

mongoose.set('debug', true);

function exit()
{
	process.exit(0);
}

const dbString = 'mongodb://' + settings.dbsettings.user +
	':' + settings.dbsettings.password +
	'@' + settings.dbsettings.address +
	':' + settings.dbsettings.port +
	'/' + settings.dbsettings.database;

try
{
	mongoose.connect(dbString)
		.then(() =>
		{
			axios.get('http://127.0.0.1:' + settings.port + '/api/getpeerinfo')
				.then(response =>
				{
					const body = [
						{
							id: 1,
							addr: 'node3.walletbuilders.com',
							addrlocal: '212.23.211.119:35398',
							services: '0000000000000005',
							relaytxes: true,
							lastsend: 1740095887,
							lastrecv: 1740095887,
							bytessent: 3301,
							bytesrecv: 3277,
							conntime: 1740090725,
							timeoffset: 0,
							pingtime: 0.007167,
							minping: 0.006896,
							version: 70015,
							subver: '/Eclipt:13.2.0/',
							inbound: false,
							startingheight: 1,
							banscore: 0,
							synced_headers: 1,
							synced_blocks: 1,
							inflight: [],
							whitelisted: false,
							bytessent_per_msg: {
								addr: 55,
								getaddr: 24,
								getheaders: 93,
								headers: 107,
								ping: 1408,
								pong: 1408,
								sendcmpct: 33,
								sendheaders: 24,
								verack: 24,
								version: 125
							},
							bytesrecv_per_msg: {
								addr: 55,
								getheaders: 93,
								headers: 107,
								ping: 1408,
								pong: 1408,
								sendcmpct: 33,
								sendheaders: 24,
								verack: 24,
								version: 125
							}
						}
					];

					console.log(body);

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
								console.log(peer);
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
											console.log('Successfully created peer from: ' + responseGeo);
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
}
catch (e)
{
	console.log(e);
}

process.on('uncaughtException', (err) =>
{
	console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) =>
{
	console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

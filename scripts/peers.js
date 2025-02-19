const mongoose = require('mongoose');
const lib = require('../lib/explorer');
const db = require('../lib/database');
const settings = require('../lib/settings');

async function exit()
{
	await mongoose.disconnect();
	process.exit(0);
}

const dbString = `mongodb://${settings.dbsettings.user}:${settings.dbsettings.password}@${settings.dbsettings.address}:${settings.dbsettings.port}/${settings.dbsettings.database}`;

async function main()
{
	try
	{
		await mongoose.connect(dbString);
		console.log('Connected to MongoDB');

		const response = await fetch(`http://127.0.0.1:${settings.port}/api/getpeerinfo`);
		const body = await response.json();

		await lib.syncLoop(body.length, async function (loop)
		{
			const i = loop.iteration();
			const peerData = body[i];

			// Разделяем IP и порт
			const portSplit = peerData.addr.lastIndexOf(":");
			const port = portSplit < 0 ? "" : peerData.addr.substring(portSplit + 1);
			const address = peerData.addr.substring(0, portSplit < 0 ? peerData.addr.length : portSplit);

			try
			{
				const peer = await db.find_peer(address);
				if (peer)
				{
					if (!peer.port || !peer.country || !peer.country_code)
					{
						await db.drop_peers();
						console.log('Saved peers missing ports or country, dropping peers. Re-reun this script afterwards.');
						exit();
					}
					return loop.next();
				}

				const geoResponse = await fetch(`https://reallyfreegeoip.org/json/${address}`);
				const geo = await geoResponse.json();

				await db.create_peer({
					address: address,
					port: port,
					protocol: peerData.version,
					version: peerData.subver.replace(/\//g, ''),
					country: geo.country_name || 'Unknown',
					country_code: geo.country_code || 'XX'
				});

				loop.next();
			}
			catch (error)
			{
				console.error(`Error processing node ${address}:`, error);
				loop.next();
			}
		});

		exit();
	}
	catch (error)
	{
		console.error('Error connection to DB:', error);
		exit();
	}
}

main();

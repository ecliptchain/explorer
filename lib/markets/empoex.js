const axios = require('axios');
const base_url = 'https://api.empoex.com';

function get_summary(coin, exchange, cb)
{
	const req_url = `${base_url}/marketinfo/${coin}-${exchange}`;
	axios.get(req_url)
		.then(response =>
		{
			const body = response.data;
			if (body.length < 1)
			{
				return cb(`Pair not found ${coin}-${exchange}`, null);
			}
			else
			{
				return cb(null, body[0]);
			}
		})
		.catch(error =>
		{
			return cb(error, null);
		});
}

function get_trades(coin, exchange, cb)
{
	const req_url = `${base_url}/markethistory/${coin}-${exchange}`;
	axios.get(req_url)
		.then(response =>
		{
			const body = response.data;
			if (body.length < 1)
			{
				return cb(`Pair not found ${coin}-${exchange}`, null);
			}
			else
			{
				return cb(null, body[`${coin}-${exchange}`]);
			}
		})
		.catch(error =>
		{
			return cb(error, null);
		});
}

function get_orders(coin, exchange, cb)
{
	const req_url = `${base_url}/orderbook/${coin}-${exchange}`;
	axios.get(req_url)
		.then(response =>
		{
			const body = response.data;
			if (body[`${coin}-${exchange}`])
			{
				const obj = body[`${coin}-${exchange}`];
				return cb(null, obj.buy, obj.sell);
			}
			else
			{
				return cb(`Pair not found ${coin}-${exchange}`, [], []);
			}
		})
		.catch(error =>
		{
			return cb(error, [], []);
		});
}

module.exports = {
	get_data: function (settings, cb)
	{
		let error = null;
		get_orders(settings.coin, settings.exchange, function (err, buys, sells)
		{
			if (err)
			{
				error = err;
			}
			get_trades(settings.coin, settings.exchange, function (err, trades)
			{
				if (err)
				{
					error = err;
				}
				get_summary(settings.coin, settings.exchange, function (err, stats)
				{
					if (err)
					{
						error = err;
					}
					return cb(error, {
						buys: buys,
						sells: sells,
						chartdata: [],
						trades: trades,
						stats: stats
					});
				});
			});
		});
	}
};

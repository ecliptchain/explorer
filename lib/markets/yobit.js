const axios = require('axios');
const base_url = 'https://yobit.io/api/3';

function get_summary(coin, exchange, cb)
{
	const req_url = `${base_url}/ticker/${coin}_${exchange}`;
	axios.get(req_url)
		.then(response =>
		{
			const body = response.data;
			if (body.message)
			{
				return cb(body.message, null);
			}
			else
			{
				return cb(null, body[`${coin}_${exchange}`]);
			}
		})
		.catch(error =>
		{
			return cb(error, null);
		});
}

function get_trades(coin, exchange, cb)
{
	const req_url = `${base_url}/trades/${coin}_${exchange}`;
	axios.get(req_url)
		.then(response =>
		{
			const body = response.data;
			if (body.message)
			{
				return cb(body.message, null);
			}
			else
			{
				return cb(null, body[`${coin}_${exchange}`]);
			}
		})
		.catch(error =>
		{
			return cb(error, null);
		});
}

function get_orders(coin, exchange, cb)
{
	const req_url = `${base_url}/depth/${coin}_${exchange}`;
	axios.get(req_url)
		.then(response =>
		{
			const body = response.data;
			if (body.success == 0)
			{
				return cb(body.error, null, null);
			}
			else
			{
				return cb(null, body[`${coin}_${exchange}`]['bids'], body[`${coin}_${exchange}`]['asks']);
			}
		})
		.catch(error =>
		{
			return cb(error, null, null);
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

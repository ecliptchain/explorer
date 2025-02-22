const axios = require('axios');
const base_url = 'https://tradesatoshi.com/api/public/';

function get_summary(coin, exchange, cb)
{
	const req_url = `${base_url}getmarketsummary?market=${coin}_${exchange}`;
	axios.get(req_url)
		.then(response =>
		{
			const body = response.data;
			const summary = {
				bid: body.result.bid,
				ask: body.result.ask,
				volume: body.result.volume,
				high: body.result.high,
				low: body.result.low,
				last: body.result.last,
				change: body.result.change
			};
			cb(null, summary);
		})
		.catch(error =>
		{
			cb(error, null);
		});
}

function get_trades(coin, exchange, cb)
{
	const req_url = `${base_url}getmarkethistory?market=${coin}_${exchange}&count=1000`;
	axios.get(req_url)
		.then(response =>
		{
			const body = response.data;
			if (body.success == true)
			{
				cb(null, body.result);
			}
			else
			{
				cb(body.message, null);
			}
		})
		.catch(error =>
		{
			cb(error, null);
		});
}

function get_orders(coin, exchange, cb)
{
	const req_url = `${base_url}getorderbook?market=${coin}_${exchange}&type=both&depth=1000`;
	axios.get(req_url)
		.then(response =>
		{
			const body = response.data;
			if (body.success)
			{
				const orders = body.result;
				const buys = [];
				const sells = [];
				if (orders.buy && orders.buy.length > 0)
				{
					for (let i = 0; i < orders.buy.length; i++)
					{
						const order = {
							amount: parseFloat(orders.buy[i].quantity).toFixed(8),
							price: parseFloat(orders.buy[i].rate).toFixed(8),
							total: (parseFloat(orders.buy[i].quantity).toFixed(8) * parseFloat(orders.buy[i].rate)).toFixed(8)
						};
						buys.push(order);
					}
				}
				if (orders.sell && orders.sell.length > 0)
				{
					for (let i = 0; i < orders.sell.length; i++)
					{
						const order = {
							amount: parseFloat(orders.sell[i].quantity).toFixed(8),
							price: parseFloat(orders.sell[i].rate).toFixed(8),
							total: (parseFloat(orders.sell[i].quantity).toFixed(8) * parseFloat(orders.sell[i].rate)).toFixed(8)
						};
						sells.push(order);
					}
				}
				cb(null, buys, sells);
			}
			else
			{
				cb(body.Message, [], []);
			}
		})
		.catch(error =>
		{
			cb(error, [], []);
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

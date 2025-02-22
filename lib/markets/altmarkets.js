const axios = require('axios');

const base_url = 'https://v2.altmarkets.io/api/v2/peatio/public/markets/';

function get_summary(coin, exchange, cb)
{
	const req_url = base_url + coin.toLowerCase() + exchange.toLowerCase() + '/tickers/';
	axios.get(req_url)
		.then(response =>
		{
			const body = response.data;
			if (body.error)
			{
				return cb(body.error, null);
			}
			else
			{
				const summary = {
					volume: parseFloat(body.ticker.amount).toFixed(8),
					volume_btc: parseFloat(body.ticker.volume).toFixed(8),
					high: parseFloat(body.ticker.high).toFixed(8),
					low: parseFloat(body.ticker.low).toFixed(8),
					last: parseFloat(body.ticker.last).toFixed(8),
					change: parseFloat(body.ticker.price_change_percent).toFixed(8)
				};
				return cb(null, summary);
			}
		})
		.catch(error =>
		{
			return cb(error, null);
		});
}

function get_trades(coin, exchange, cb)
{
	const req_url = base_url + coin.toLowerCase() + exchange.toLowerCase() + '/trades/?limit=50&order_by=desc';
	axios.get(req_url)
		.then(response =>
		{
			const body = response.data;
			if (body.error)
			{
				return cb(body.error, null);
			}
			else
			{
				return cb(null, body);
			}
		})
		.catch(error =>
		{
			return cb(error, null);
		});
}

function get_orders(coin, exchange, cb)
{
	const req_url = base_url + coin.toLowerCase() + exchange.toLowerCase() + '/order-book/';
	axios.get(req_url)
		.then(response =>
		{
			const body = response.data;
			if (body.error)
			{
				return cb(body.error, [], []);
			}
			else
			{
				const orders = body;
				let buys = [];
				let sells = [];

				if (orders.bids && orders.bids.length > 0)
				{
					for (let i = 0; i < orders.bids.length; i++)
					{
						const order = {
							amount: parseFloat(orders.bids[i].remaining_volume).toFixed(8),
							price: parseFloat(orders.bids[i].price).toFixed(8),
							total: (parseFloat(orders.bids[i].remaining_volume).toFixed(8) * parseFloat(orders.bids[i].price)).toFixed(8)
						};
						buys.push(order);
					}
				}

				if (orders.asks && orders.asks.length > 0)
				{
					for (let i = 0; i < orders.asks.length; i++)
					{
						const order = {
							amount: parseFloat(orders.asks[i].remaining_volume).toFixed(8),
							price: parseFloat(orders.asks[i].price).toFixed(8),
							total: (parseFloat(orders.asks[i].remaining_volume).toFixed(8) * parseFloat(orders.asks[i].price)).toFixed(8)
						};
						sells.push(order);
					}
				}

				sells = sells.reverse();
				return cb(null, buys, sells);
			}
		})
		.catch(error =>
		{
			return cb(error, [], []);
		});
}

function get_chartdata(coin, exchange, cb)
{
	let end = Date.now();
	end = parseInt(end / 1000);
	const start = end - 86400;
	const req_url = base_url + coin.toLowerCase() + exchange.toLowerCase() + '/k-line/?time_from=' + start + '&time_to=' + end + '&period=1';
	axios.get(req_url)
		.then(response =>
		{
			const chartdata = response.data;
			if (chartdata.error == null)
			{
				let processed = [];
				for (let i = 0; i < chartdata.length; i++)
				{
					processed.push([
						chartdata[i][0] * 1000,
						parseFloat(chartdata[i][1]),
						parseFloat(chartdata[i][2]),
						parseFloat(chartdata[i][3]),
						parseFloat(chartdata[i][4])
					]);
				}
				return cb(null, processed);
			}
			else
			{
				return cb(chartdata.error, []);
			}
		})
		.catch(error =>
		{
			return cb(error, []);
		});
}

module.exports = {
	get_data: function (settings, cb)
	{
		let error = null;
		get_chartdata(settings.coin, settings.exchange, function (err, chartdata)
		{
			if (err)
			{
				chartdata = [];
				error = err;
			}
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
							chartdata: chartdata,
							trades: trades,
							stats: stats
						});
					});
				});
			});
		});
	}
};

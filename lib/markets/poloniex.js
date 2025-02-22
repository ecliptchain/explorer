const axios = require('axios');
const base_url = 'https://poloniex.com/public?command=';

function get_summary(coin, exchange, cb)
{
	const req_url = base_url + 'returnTicker';
	const ticker = exchange + '_' + coin;
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
				return cb(null, body[ticker]);
			}
		})
		.catch(error =>
		{
			return cb(error, null);
		});
}

function get_trades(coin, exchange, cb)
{
	const req_url = base_url + 'returnTradeHistory&currencyPair=' + exchange + '_' + coin;
	axios.get(req_url)
		.then(response =>
		{
			const body = response.data;
			if (body.error)
			{
				return cb(body.error, []);
			}
			else
			{
				return cb(null, body);
			}
		})
		.catch(error =>
		{
			return cb(error, []);
		});
}

function get_orders(coin, exchange, cb)
{
	const req_url = base_url + 'returnOrderBook&currencyPair=' + exchange + '_' + coin + '&depth=50';
	axios.get(req_url)
		.then(response =>
		{
			const body = response.data;
			if (body.error)
			{
				return cb(body.error, []);
			}
			else
			{
				return cb(null, body);
			}
		})
		.catch(error =>
		{
			return cb(error, []);
		});
}

function get_chartdata(coin, exchange, cb)
{
	let end = Date.now() / 1000;
	let start = end - 86400;
	const req_url = base_url + 'returnChartData&currencyPair=' + exchange + '_' + coin + '&start=' + start + '&end=' + end + '&period=1800';
	axios.get(req_url)
		.then(response =>
		{
			const chartdata = response.data;
			if (!chartdata.error)
			{
				let processed = [];
				for (let i = 0; i < chartdata.length; i++)
				{
					processed.push([
						chartdata[i].date * 1000,
						parseFloat(chartdata[i].open),
						parseFloat(chartdata[i].high),
						parseFloat(chartdata[i].low),
						parseFloat(chartdata[i].close)
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
			get_orders(settings.coin, settings.exchange, function (err, orders)
			{
				let buys = [];
				let sells = [];
				if (orders && orders.bids)
				{
					buys = orders.bids;
					sells = orders.asks;
				}
				else
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

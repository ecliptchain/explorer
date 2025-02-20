const axios = require('axios');

const base_url = 'https://v2.altmarkets.io/api/v2/peatio/public/markets/';

// Fetch function with error handling
async function fetchData(url)
{
	try
	{
		const response = await axios.get(url);
		return response.data;
	}
	catch (error)
	{
		console.error(`Error fetching data from ${url}:`, error.message);
		return {error: error.message || 'Unknown error'};
	}
}

// Get market summary
async function get_summary(coin, exchange)
{
	const req_url = `${base_url}${coin.toLowerCase()}${exchange.toLowerCase()}/tickers/`;
	const body = await fetchData(req_url);

	if (body.error)
	{
		return {error: body.error};
	}

	return {
		volume: parseFloat(body.ticker.amount).toFixed(8),
		volume_btc: parseFloat(body.ticker.volume).toFixed(8),
		high: parseFloat(body.ticker.high).toFixed(8),
		low: parseFloat(body.ticker.low).toFixed(8),
		last: parseFloat(body.ticker.last).toFixed(8),
		change: parseFloat(body.ticker.price_change_percent).toFixed(8),
	};
}

// Get recent trades
async function get_trades(coin, exchange)
{
	const req_url = `${base_url}${coin.toLowerCase()}${exchange.toLowerCase()}/trades/?limit=50&order_by=desc`;
	const body = await fetchData(req_url);
	return body.error ? {error: body.error} : body;
}

// Get order book
async function get_orders(coin, exchange)
{
	const req_url = `${base_url}${coin.toLowerCase()}${exchange.toLowerCase()}/order-book/`;
	const body = await fetchData(req_url);

	if (body.error)
	{
		return {error: body.error, buys: [], sells: []};
	}

	const buys = body.bids?.map(order => ({
		amount: parseFloat(order.remaining_volume).toFixed(8),
		price: parseFloat(order.price).toFixed(8),
		total: (parseFloat(order.remaining_volume) * parseFloat(order.price)).toFixed(8),
	})) || [];

	const sells = (body.asks?.map(order => ({
		amount: parseFloat(order.remaining_volume).toFixed(8),
		price: parseFloat(order.price).toFixed(8),
		total: (parseFloat(order.remaining_volume) * parseFloat(order.price)).toFixed(8),
	})) || []).reverse(); // Reverse to keep order

	return {buys, sells};
}

// Get chart data
async function get_chartdata(coin, exchange)
{
	const end = Math.floor(Date.now() / 1000);
	const start = end - 86400;
	const req_url = `${base_url}${coin.toLowerCase()}${exchange.toLowerCase()}/k-line/?time_from=${start}&time_to=${end}&period=1`;

	const chartdata = await fetchData(req_url);
	if (chartdata.error)
	{
		return {error: chartdata.error, data: []};
	}

	return {
		data: chartdata.map(entry => [entry[0] * 1000, ...entry.slice(1, 5).map(parseFloat)]),
	};
}

// Export function to get all data
module.exports = {
	get_data: async function (settings, cb)
	{
		try
		{
			const [chartdata, orders, trades, summary] = await Promise.all([
				get_chartdata(settings.coin, settings.exchange),
				get_orders(settings.coin, settings.exchange),
				get_trades(settings.coin, settings.exchange),
				get_summary(settings.coin, settings.exchange),
			]);

			return cb(null, {
				buys: orders.buys,
				sells: orders.sells,
				chartdata: chartdata.data,
				trades,
				stats: summary,
			});
		}
		catch (error)
		{
			console.error("Error in get_data:", error);
			return cb(error, null);
		}
	},
};

const fetch = require('node-fetch');

const base_url = 'https://tradesatoshi.com/api/public/';

async function fetchData(url)
{
	try
	{
		const response = await fetch(url);
		if (!response.ok)
		{
			throw new Error(`HTTP Error: ${response.status}`);
		}
		const body = await response.json();
		if (body.success === false)
		{
			throw new Error(body.message || 'Unknown API error');
		}
		return body.result;
	}
	catch (error)
	{
		console.error(`Error fetching data from ${url}:`, error.message);
		return null;
	}
}

async function get_summary(coin, exchange)
{
	const url = `${base_url}getmarketsummary?market=${coin}_${exchange}`;
	const body = await fetchData(url);
	if (!body)
	{
		return {error: `Pair not found: ${coin}-${exchange}`};
	}

	return {
		bid: parseFloat(body.bid).toFixed(8),
		ask: parseFloat(body.ask).toFixed(8),
		volume: parseFloat(body.volume).toFixed(8),
		high: parseFloat(body.high).toFixed(8),
		low: parseFloat(body.low).toFixed(8),
		last: parseFloat(body.last).toFixed(8),
		change: parseFloat(body.change).toFixed(8)
	};
}

async function get_trades(coin, exchange)
{
	const url = `${base_url}getmarkethistory?market=${coin}_${exchange}&count=1000`;
	const body = await fetchData(url);
	if (!body)
	{
		return {error: `No trade history found for ${coin}-${exchange}`};
	}

	return body;
}

async function get_orders(coin, exchange)
{
	const url = `${base_url}getorderbook?market=${coin}_${exchange}&type=both&depth=1000`;
	const body = await fetchData(url);
	if (!body)
	{
		return {buys: [], sells: [], error: `No order book data available for ${coin}-${exchange}`};
	}

	const buys = (body.buy || []).map(order => ({
		amount: parseFloat(order.quantity).toFixed(8),
		price: parseFloat(order.rate).toFixed(8),
		total: (parseFloat(order.quantity) * parseFloat(order.rate)).toFixed(8)
	}));

	const sells = (body.sell || []).map(order => ({
		amount: parseFloat(order.quantity).toFixed(8),
		price: parseFloat(order.rate).toFixed(8),
		total: (parseFloat(order.quantity) * parseFloat(order.rate)).toFixed(8)
	}));

	return {buys, sells};
}

module.exports = {
	get_data: async function (settings, cb)
	{
		try
		{
			const [orders, trades, summary] = await Promise.all([
				get_orders(settings.coin, settings.exchange),
				get_trades(settings.coin, settings.exchange),
				get_summary(settings.coin, settings.exchange)
			]);

			return cb(null, {
				buys: orders.buys,
				sells: orders.sells,
				chartdata: [],
				trades,
				stats: summary
			});
		}
		catch (error)
		{
			console.error("Error in get_data:", error);
			return cb(error, null);
		}
	}
};

const axios = require('axios');

const base_url = 'https://api.crex24.com/v2/public';

// Generalized fetch function with error handling
async function fetchData(url)
{
	try
	{
		const response = await axios.get(url);
		if (response.data.error)
		{
			throw new Error(response.data.Message || 'Unknown API error');
		}
		return response.data;
	}
	catch (error)
	{
		console.error(`Error fetching data from ${url}:`, error.message);
		return null;
	}
}

// Get market summary
async function get_summary(coin, exchange)
{
	const url = `${base_url}/tickers?instrument=${coin.toUpperCase()}-${exchange.toUpperCase()}`;
	const body = await fetchData(url);
	if (!body || body.length === 0)
	{
		return {error: "No market summary data available"};
	}

	return {
		ask: parseFloat(body[0].ask).toFixed(8),
		bid: parseFloat(body[0].bid).toFixed(8),
		volume: parseFloat(body[0].baseVolume).toFixed(8),
		volume_btc: parseFloat(body[0].volumeInBtc).toFixed(8),
		high: parseFloat(body[0].high).toFixed(8),
		low: parseFloat(body[0].low).toFixed(8),
		last: parseFloat(body[0].last).toFixed(8),
		change: parseFloat(body[0].percentChange)
	};
}

// Get trade history
async function get_trades(coin, exchange)
{
	const url = `${base_url}/recentTrades?instrument=${coin.toUpperCase()}-${exchange.toUpperCase()}`;
	const body = await fetchData(url);
	if (!body || body.length === 0)
	{
		return {error: "No trade history available"};
	}

	return body.map(trade => ({
		orderpair: trade.Label || `${coin.toUpperCase()}-${exchange.toUpperCase()}`,
		ordertype: trade.side,
		amount: parseFloat(trade.volume).toFixed(8),
		price: parseFloat(trade.price).toFixed(8),
		total: (parseFloat(trade.volume) * parseFloat(trade.price)).toFixed(8),
		timestamp: Math.floor(new Date(trade.timestamp).getTime() / 1000)
	}));
}

// Get order book
async function get_orders(coin, exchange)
{
	const url = `${base_url}/orderBook?instrument=${coin.toUpperCase()}-${exchange.toUpperCase()}`;
	const body = await fetchData(url);
	if (!body)
	{
		return {buys: [], sells: [], error: "No order book data available"};
	}

	const buys = (body.buyLevels || []).map(order => ({
		amount: parseFloat(order.volume).toFixed(8),
		price: parseFloat(order.price).toFixed(8),
		total: (parseFloat(order.volume) * parseFloat(order.price)).toFixed(8)
	}));

	const sells = (body.sellLevels || []).map(order => ({
		amount: parseFloat(order.volume).toFixed(8),
		price: parseFloat(order.price).toFixed(8),
		total: (parseFloat(order.volume) * parseFloat(order.price)).toFixed(8)
	}));

	return {buys, sells};
}

// Export function to get all data
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

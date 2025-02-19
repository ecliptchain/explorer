const fetch = require('node-fetch');

const base_url = 'https://api.cryptsy.com/api/v2/markets';

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
		if (!body.success)
		{
			throw new Error(body.message || 'Unknown API error');
		}
		return body.data;
	}
	catch (error)
	{
		console.error(`Error fetching data from ${url}:`, error.message);
		return null;
	}
}

async function get_summary(coin, exchange, Crymktid)
{
	const url1 = `${base_url}/${Crymktid}/ticker`;
	const tickerData = await fetchData(url1);
	if (!tickerData)
	{
		return {error: "No market summary data available"};
	}

	const summary = {
		bid: parseFloat(tickerData.bid).toFixed(8),
		ask: parseFloat(tickerData.ask).toFixed(8)
	};

	const url2 = `${base_url}/${Crymktid}`;
	const marketData = await fetchData(url2);
	if (!marketData)
	{
		return {error: "No market data available"};
	}

	summary.volume = marketData['24hr'].volume;
	summary.volume_btc = marketData['24hr'].volume_btc;
	summary.high = marketData['24hr'].price_high;
	summary.low = marketData['24hr'].price_low;
	summary.last = marketData.last_trade.price;

	return summary;
}

async function get_trades(coin, exchange, Crymktid)
{
	const url = `${base_url}/${Crymktid}/tradehistory?limit=100`;
	const body = await fetchData(url);
	if (!body)
	{
		return {error: "No trade history available"};
	}

	return body.map(trade => ({
		ordertype: trade.type,
		amount: parseFloat(trade.quantity).toFixed(8),
		price: parseFloat(trade.price).toFixed(8),
		total: (parseFloat(trade.quantity) * parseFloat(trade.price)).toFixed(8),
		timestamp: new Date(trade.timestamp).getTime() / 1000
	}));
}

async function get_orders(coin, exchange, Crymktid)
{
	const url = `${base_url}/${Crymktid}/orderbook?type=both&limit=50`;
	const body = await fetchData(url);
	if (!body)
	{
		return {buys: [], sells: [], error: "No order book data available"};
	}

	const buys = (body.buyorders || []).map(order => ({
		amount: parseFloat(order.quantity).toFixed(8),
		price: parseFloat(order.price).toFixed(8),
		total: (parseFloat(order.quantity) * parseFloat(order.price)).toFixed(8)
	}));

	const sells = (body.sellorders || []).map(order => ({
		amount: parseFloat(order.quantity).toFixed(8),
		price: parseFloat(order.price).toFixed(8),
		total: (parseFloat(order.quantity) * parseFloat(order.price)).toFixed(8)
	}));

	return {buys, sells};
}

module.exports = {
	get_data: async function (settings, cb)
	{
		try
		{
			const [orders, trades, summary] = await Promise.all([
				get_orders(settings.coin, settings.exchange, settings.cryptsy_id),
				get_trades(settings.coin, settings.exchange, settings.cryptsy_id),
				get_summary(settings.coin, settings.exchange, settings.cryptsy_id)
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

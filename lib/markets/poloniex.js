const axios = require('axios');

const base_url = 'https://poloniex.com/public?command=';

// Generalized fetch function with error handling
async function fetchData(url)
{
	try
	{
		const response = await axios.get(url);
		if (response.data.error)
		{
			throw new Error(response.data.error || 'Unknown API error');
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
	const url = `${base_url}returnTicker`;
	const body = await fetchData(url);
	if (!body)
	{
		return {error: `Pair not found: ${coin}-${exchange}`};
	}

	const ticker = `${exchange}_${coin}`;
	return body[ticker] || {error: `No summary data for ${ticker}`};
}

// Get trade history
async function get_trades(coin, exchange)
{
	const url = `${base_url}returnTradeHistory&currencyPair=${exchange}_${coin}`;
	const body = await fetchData(url);
	if (!body)
	{
		return {error: `No trade history found for ${coin}-${exchange}`};
	}

	return body;
}

// Get order book
async function get_orders(coin, exchange)
{
	const url = `${base_url}returnOrderBook&currencyPair=${exchange}_${coin}&depth=50`;
	const body = await fetchData(url);
	if (!body)
	{
		return {buys: [], sells: [], error: `No order book data available for ${coin}-${exchange}`};
	}

	return {
		buys: body.bids || [],
		sells: body.asks || []
	};
}

// Get historical chart data (24-hour period)
async function get_chartdata(coin, exchange)
{
	const end = Math.floor(Date.now() / 1000);
	const start = end - 86400;
	const url = `${base_url}returnChartData&currencyPair=${exchange}_${coin}&start=${start}&end=${end}&period=1800`;

	const body = await fetchData(url);
	if (!body)
	{
		return {error: `No chart data available for ${coin}-${exchange}`};
	}

	return body.map(data => [
		data.date * 1000, // Convert to milliseconds
		parseFloat(data.open),
		parseFloat(data.high),
		parseFloat(data.low),
		parseFloat(data.close)
	]);
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
				get_summary(settings.coin, settings.exchange)
			]);

			return cb(null, {
				buys: orders.buys,
				sells: orders.sells,
				chartdata,
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

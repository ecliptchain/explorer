const axios = require('axios');

const base_url = 'https://c-cex.com/t/';
const d1 = new Date();
const d2 = new Date();
d1.setDate(d1.getDate() - 2);

function pad(x)
{
	return x < 10 ? `0${x}` : x;
}

function toTimestamp(strDate)
{
	return Date.parse(strDate) / 1000;
}

function formatdate(date1)
{
	return `${date1.getUTCFullYear()}-${pad(date1.getUTCMonth() + 1)}-${pad(date1.getUTCDate())}`;
}

// Sleep function (9-second delay)
async function sleep9s()
{
	return new Promise(resolve => setTimeout(resolve, 9000));
}

// Generalized fetch function with error handling
async function fetchData(url)
{
	try
	{
		const response = await axios.get(url);
		if (response.data.message)
		{
			throw new Error(response.data.message);
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
	await sleep9s();
	const summary = {};
	const url1 = `${base_url}s.html?a=volume&h=24&pair=${coin}-${exchange}`;
	const response1 = await fetchData(url1);

	if (!response1 || !response1.return)
	{
		return {error: "No market summary data available"};
	}

	const i = response1.return.length - 1;
	summary.volume = parseFloat(response1.return[i][`volume_${coin}`]).toFixed(8);
	summary.volume_btc = parseFloat(response1.return[i][`volume_${exchange}`]).toFixed(8);

	await sleep9s();
	const url2 = `${base_url}${coin}-${exchange}.json`;
	const response2 = await fetchData(url2);

	if (!response2 || !response2.ticker)
	{
		return {error: "No ticker data available"};
	}

	summary.bid = parseFloat(response2.ticker.buy).toFixed(8);
	summary.ask = parseFloat(response2.ticker.sell).toFixed(8);
	summary.high = parseFloat(response2.ticker.high).toFixed(8);
	summary.low = parseFloat(response2.ticker.low).toFixed(8);
	summary.last = parseFloat(response2.ticker.lastprice).toFixed(8);

	return summary;
}

// Get trade history
async function get_trades(coin, exchange)
{
	const url = `${base_url}s.html?a=tradehistory&d1=${formatdate(d1)}&d2=${formatdate(d2)}&pair=${coin}-${exchange}`;
	await sleep9s();
	const response = await fetchData(url);

	if (!response || !response.return)
	{
		return {error: "No trade history available"};
	}

	if (response.return === "No trade history for this period")
	{
		return {error: response.return};
	}

	return response.return.map(trade => ({
		ordertype: trade.type,
		amount: parseFloat(trade.amount).toFixed(8),
		price: parseFloat(trade.rate).toFixed(8),
		total: (parseFloat(trade.amount) * parseFloat(trade.rate)).toFixed(8),
		datetime: trade.datetime,
		timestamp: toTimestamp(trade.datetime + 'Z'),
		backrate: trade.backrate
	}));
}

// Get order book
async function get_orders(coin, exchange, ccex_key)
{
	const url = `${base_url}r.html?key=${ccex_key}&a=orderlist&self=0&pair=${coin}-${exchange}`;
	await sleep9s();
	const response = await fetchData(url);

	if (!response || !response.return)
	{
		return {buys: [], sells: [], error: "No order book data available"};
	}

	const orders = response.return;
	const buys = [];
	const sells = [];

	for (const order of orders)
	{
		const formattedOrder = {
			otype: order.type,
			amount: parseFloat(order.amount).toFixed(8),
			price: parseFloat(order.price).toFixed(8),
			total: (parseFloat(order.amount) * parseFloat(order.price)).toFixed(8)
		};
		order.type === 'buy' ? buys.push(formattedOrder) : sells.push(formattedOrder);
	}

	return {buys, sells};
}

// Export function to get all data
module.exports = {
	get_data: async function (settings, cb)
	{
		try
		{
			const [orders, trades, summary] = await Promise.all([
				get_orders(settings.coin, settings.exchange, settings.ccex_key),
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

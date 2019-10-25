const url = require('url')
const util = require('util')
const secrets = require(process.env.SECRETS_PATH)
const stripe = require('stripe')(secrets.STRIPE_SECRET_KEY)

const mailerReady = (async function retry(){
	try {
		const mailer = nodemailer.createTransport({
			pool: true,
			secure: true,
			host: secrets.SMTP_HOSTNAME,
			auth: {
				user: secrets.SMTP_USERNAME,
				pass: secrets.SMTP_PASSWORD
			}
		})
		await mailer.verify()
		console.log('connected to SMTP account:', secrets.SMTP_USERNAME)
		return mailer
	} catch(err) {
		console.error('unable to connect to SMTP host:' + err.toString())
		return retry()
	}
})()

const GoogleSpreadsheet = require('google-spreadsheet')
const gsheet = new GoogleSpreadsheet(secrets.GOOGLE_SHEET_ID)
const googleServiceAccount = {
	client_email: secrets.GOOGLE_CLIENT_EMAIL,
	private_key: Buffer.from(secrets.GOOGLE_PRIVATE_KEY, 'base64').toString('utf8')
}

const promiser = function() {
	const context = {}
	const promise = new Promise((resolve, reject) => {
		context.resolve = resolve
		context.reject = reject
	})
	promise.callback = (err, data) => {
		if (err) context.reject(err)
		else context.resolve(data)
	}
	return promise
}

const docReady = (async function(){
	const auth = promiser()
	gsheet.useServiceAccountAuth(googleServiceAccount, auth.callback)
	await auth
	const info = promiser()
	gsheet.getInfo(info.callback)
	const doc = await info
	console.log('connected to google sheets:', doc.title.toLowerCase())
	return doc
})()

const serializer = {
	created: ({ order }) => new Date(order.created*1000).toISOString(),
	name: ({ customer }) => customer.description,
	email: ({ customer }) => customer.email,
	customer: ({ customer }) => customer.id,
	order: ({ order }) => order.id,
	amount: ({ order }) => order.amount.toFixed(2),
	currency: ({ order }) => order.currency,
	sku: ({ dinner }) => dinner.id,
}

function json(res, obj, status=200) {
	res.writeHead(status, {
		'Content-Type': 'application/json; charset=utf-8',
	});
    res.end(JSON.stringify(obj))
}

async function ensureSheetExists({ dinner: { id: title } }) {
	const doc = await docReady
	const sheets = doc.worksheets.filter(s => s.title == title)
	if (sheets.length > 0) {
		console.info(`found registration sheet for dinner: ${sheets[0].title}`)
		return sheets[0]
	}

	console.warn(`unable to find sheet for dinner ${title}, creating one...`)
	let async = promiser()
	gsheet.addWorksheet({ title }, async.callback)
	const sheet = await async

	async = promiser()
	sheet.setHeaderRow(Object.keys(serializer), async.callback)
	await async

	return sheet
}

async function track(context) {
	try {
		console.log(`tracking ${context.customer.email} for dinner ${context.dinner.id}...`)
		const sheet = await ensureSheetExists(context)
		const reducer = (acc, key) => { acc[key] = serializer[key](context); return acc }
		const seriailized = Object.keys(serializer).reduce(reducer, {})
		const row = promiser()
		sheet.addRow(seriailized, row.callback)
		const done = await row
		console.log('order registered:', done.id)
		return done
	} catch (ex) {
		console.warn(ex.stack)
		return null
	}
}

const confirmationHTML = ({ customer, order, dinner }) => `
<!DOCTYPE html>
<html>
<head>
	<title>Harrison Metal Alumni Dinner Confirmation</title>
</head>
<body style="background-color:#b89e8b;color:#333;font:16px/1.5 sans-serif;padding:1rem">
	<header style="overflow:hidden;margin-bottom:1rem;">
		<img style="float:left;width:4.5rem;margin-right:1rem" src="data:image/png;base64,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" />
		<h1 style="margin:0;padding:0;color:#754c29;line-height:1">HARRISON METAL</h1>
		<h2 style="margin:0;padding:0;color:#754c29;line-height:1">ALUMNI DINNER</h2>
	</header>
	<main style="background-color:#fff;border-radius:3px;padding:1rem 2rem;box-sizing:border-box;min-height:100%">
		<p>Hey ${customer.description.split(/\s+/)[0]},</p>
		<p>
		Thanks for registering for Dinner ${dinner.id.replace(/\D+/g, '')}.<br/>
		Your registration details are below, for your records:
		</p>
		<table border="1" cellpadding="8" style="table-layout:fixed;width:100%;border-color:#DDD;border-spacing:0;border-collapse:collapse;border-radius:3px">
			<tbody>
				<tr><td style="width:8rem" align="right">Date</td> <td>${(new Date(dinner.attributes.datetime)).toLocaleString()}</td></tr>
				<tr><td align="right">Theme</td> <td>${dinner.attributes.theme}</td></tr>
				<tr><td align="right">Venue</td> <td>${dinner.attributes.venue}</td></tr>
				<tr><td align="right">Chef</td> <td>${dinner.attributes.chef}</td></tr>
				<tr><td align="right">Menu</td> <td>${dinner.attributes.menu}</td></tr>
			</tbody>
			<tfoot style="background-color:#EEE">
				<tr><td align="right">Order #</td><td>${order.id.substr(-8).toUpperCase()}</td></tr>
				<tr><td align="right">Paid</td><td>$${(order.amount/100).toFixed(2)}</td></tr>
			</tfoot>
		</table>
		<p>We'll see you soon!</p>
		<p>- Jon</p>
	</main>
</body>
</html>
`

function icalDate(datetime, addHours = 0) {
	const date = datetime ? new Date(datetime) : new Date()
	date.setHours(date.getHours() + addHours)
	return date.toISOString().replace(/([\-:])|(\.\d+)/g,'')
}

const icalContent = ({ dinner, order }) => `
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//hmad/cal//1.0//EN
BEGIN:VEVENT
UID:${order.id}
DTSTAMP:${icalDate()}
ORGANIZER;CN=Jonathan Azoff:MAILTO:${secrets.MAIL_BCC_ADDRESS}
DTSTART:${icalDate(dinner.attributes.datetime)}
DTEND:${icalDate(dinner.attributes.datetime, 2.5)}
SUMMARY:Dinner ${dinner.id.replace(/\D+/g, '')} - ${dinner.attributes.theme}
END:VEVENT
END:VCALENDAR
`

const icalAttachment = context => ({
	filename: 'invite.ics',
	contentType: 'text/calendar',
	content: icalContent(context)
})

async function confirm({ customer, order, dinner }) {
	const attachments = []
	try {
		attachments.push(icalAttachment({ order, dinner }))
	} catch(ex) {
		console.warn(ex.stack)
	}
	try {
		console.log(`sending confirmation to ${customer.email} for dinner ${dinner.id}...`)
		const mailer = await mailerReady
		const msg = await mailer.sendMail({
		    from: secrets.MAIL_FROM_ADDRESS,
		    // bcc: secrets.MAIL_BCC_ADDRESS,
		    to: customer.email,
		    subject: `We'll see you for dinner!`,
		    html: confirmationHTML({ customer, order, dinner }),
		    attachments
		})
		console.log('email sent:', msg.messageId)
		return msg
	} catch(ex) {
		console.error(ex.stack)
		return null
	}
}

const parseBody = req => new Promise((resolve, reject) => {
	let body = ''
	req.on('data', data => body += data)
	req.on('end', () => {
		try {
			resolve(JSON.parse(body))
		} catch (ex) {
			reject(ex)
		}
	})
})

const post = async (res, req) => {
	try {
		const { name, email, token, sku } = await parseBody(req)
		if (!name) throw new Error('Missing or invalid name')
		if (!email) throw new Error('Missing or invalid email')
		if (!token) throw new Error('Missing or invalid stripe token')
		if (!sku) throw new Error('Missing or invalid product sku')

		console.log(`looking for stripe customer ${email}...`)
		let { data: [ customer ] } = await stripe.customers.list({ email, limit: 1 })
		if (!customer) {
			console.log(`none found. creating stripe customer for ${email}...`)
			customer = await stripe.customers.create({
				email,
				description: name,
				source: token
			})
		} else {
			console.log(`found customer ${customer.id} for email ${email}...`)
		}

		console.log(`creating order for customer ${customer.id}...`)
		const cart = await stripe.orders.create({
			currency: 'usd',
			customer: customer.id,
			items: [{ type: 'sku', parent: sku, quantity: 1}]
		})

		console.log(`paying order ${cart.id}...`)
		const order = await stripe.orders.pay(cart.id, { customer: customer.id })

		console.log('order complete:', order.id)
		const dinner = await stripe.skus.retrieve(sku)
		const context = { customer, order, dinner }

		await Promise.all([
			track(context),
			confirm(context)
		])

		json(res, context)

	} catch(ex) {
		console.warn(ex.stack)
		json(res, { error: ex.message }, 400)
	}
}

const get = async (res, req) => {
	const {
		STRIPE_PRODUCT_ID: product,
		STRIPE_PUBLISHABLE_KEY: stripe_key
	} = secrets
	try {
		const body = { stripe_key }
		const sku = url.parse(req.url, true).query.sku;
		if (sku) {
			body.dinner = await stripe.skus.retrieve(sku)
		} else {
			const { data: [ dinner ] } = await stripe.skus.list({
				product,
				active: true,
				limit: 1
			})
			body.dinner = dinner
		}
		json(res, body)
	} catch(e) {
		json(res, { error: e.toString() })
	}
}

const other = res => res.sendStatus(405)

module.exports = (req, res) => {
	switch(req.method) {
		case 'GET': return get(res, req)
		case 'POST': return post(res, req)
		default: return other(res, req)
	}
}
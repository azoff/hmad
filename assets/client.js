function client({ stripe_key, dinner }, { Stripe, fetch, document: dom }) {

	const context = {
		stripe: new Stripe(stripe_key),
		stripeElements: {}
	}

	function addEventListeners() {
		dom.querySelector('form').addEventListener('submit', onFormSubmit)
		context.stripeElements.card.addEventListener('change', onCardChange)
	}

	function mountStripeElements(elements) {
		const el = dom.querySelectorAll('[data-stripe-element-name]').forEach(el => {
			const stripeElementName = el.dataset.stripeElementName
			const stripeElement = elements.create(stripeElementName)
			stripeElement.mount(el)
			context.stripeElements[stripeElementName] = stripeElement
		})
	}

	function onCardChange({ error }) {
		alert(error ? error.message : '', 'error', Boolean(error))
	}

	function alert(textContent, className, toggle) {
		const alert = dom.querySelector('[role=alert]')
		alert.textContent = textContent
		alert.classList.remove('notice')
		alert.classList.remove('error')
		alert.classList.remove('success')
		alert.classList.toggle(className, toggle)
	}

	async function onFormSubmit(e) {
		e.preventDefault()

		const form = e.target
		const { button, name, email } = form

		if (button.disabled) return

		button.disabled = true;
		button.originalTextContent = button.textContent
		button.textContent = 'Submitting Registration…'

		const { token, error } = await context.stripe.createToken(context.stripeElements.card)
		if (error) {
			alert(error.message, 'error', true)
		} else if (!name.value) {
			alert('Please provide your full name', 'error', true)
		} else if (!email.value) {
			alert('Please provide your email address', 'error', true)
		} else {
			const { order, dinner, error } = await submit(form, token)
			console.log('order', order)
			console.log('dinner', dinner)
			if (error) {
				alert(error, 'error', true)
			} else {
				form.reset()
				context.stripeElements.card.clear()
				setTimeout(() => {
					alert("You're in! Check your email for details.", 'success', true)
					renderDinner(dinner)
				}, 100)

			}
		}

		button.disabled = false;
		button.textContent = button.originalTextContent
	}

	async function submit({ action: url, name: { value: name }, email: { value: email } }, { id: token }) {
		try {
			alert('', 'error', false)
			const res = await fetch(url, {
				method: 'POST',
				headers: {'Content-Type': 'application/json; charset=utf-8'},
				body: JSON.stringify({ name, email, token, sku: dinner.id })
			})
			const order = await res.json()
			return { order, error: order.error }
		} catch(ex) {
			console.error(ex)
			return { error: 'Can\'t connect to the internet.'  }
		}
	}

	function renderDinner({ id, attributes, price, inventory }) {
		const datetime = new Date(attributes.datetime).toLocaleString().replace(/(\d+:\d+):\d+/, '$1')
		const vars = Object.assign({
			number: id.replace(/\D+/g, ''),
			price: `$${(price/100).toFixed(2)}`
		}, attributes, { datetime })
		dom.querySelectorAll('[data-dinner]').forEach(el => {
			el.textContent = vars[el.dataset.dinner]
		})
		if (inventory.quantity <= 0) {
			dom.forms[0].button.disabled = true
			dom.forms[0].button.textContent = 'Dinner Fully Booked'
		}
	}

	function toggleForm(className, toggle) {
		dom.querySelector('form').classList.toggle(className, toggle)
	}

	function startSlideshow() {
		const slides = dom.querySelectorAll('#slideshow div')
		const total = slides.length
		let active = Array.prototype.findIndex.call(slides, el => el.classList.contains('active'))
		setInterval(() => {
			active = (active + 1) % total
			slides.forEach((slide, index) => {
				slide.classList.toggle('active', index === active)
			})
		}, 6000)
	}

	return {
		run() {
			mountStripeElements(context.stripe.elements())
			addEventListeners()
			renderDinner(dinner)
			startSlideshow()
			toggleForm('loaded', true)
		}
	}

}
const sku = new URLSearchParams(location.search).get('sku')
const apiURL = sku ? `/api?sku=${sku}` : '/api'
fetch(apiURL).then(async res => {
	const config = await res.json()
	client(config, window).run()
})
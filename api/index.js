#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const express = require('express')
const morgan = require('morgan')

const app = express()
app.use(morgan('combined'))
app.use('/api', require('./handler'))
app.use(express.static(path.normalize(`${__dirname}/../`)))

const port = process.env.PORT || 8080
app.listen(port, () => console.log(`listening on port ${port}...`))
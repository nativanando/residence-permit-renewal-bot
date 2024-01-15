const cron = require('node-cron')
const { exec } = require('child_process')

const runScript = () => {
  console.log('Running bot...')
  const command = 'npx playwright test'

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error executing the test: ${error.message}`)
      return
    }
    console.log(`Bot output:\n${stdout}`)
  });
}

const job = new cron.schedule('*/5 * * * *', runScript)

job.start()
import 'dotenv/config';
import { test, expect } from '@playwright/test';
import { Client, GatewayIntentBits } from 'discord.js';

const appointmentsAvailable = []

const sendDiscordMessage = async (message) => {
  try {
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
      ],
    })

    await client.login(process.env.CLIENT_TOKEN)

    client.on('ready', () => {
      const channel = client.channels.cache.get(process.env.DISCORD_CHANNEL_ID)
      if (channel) {
        channel.send(message).then(() => { console.log('Message sent successfully') })
        .catch((error) => { console.error('Error sending message:', error) })
        .finally(async () => { await client.destroy() })
      }
    })
  } catch (error) {
    console.error('Error initializing Discord client:', error);
  }
}

const isAValidOption = (value) => {
  return value.trim() !== '' && !isNaN(Number(value)) && Number(value) >= 0;
}

const getSelectValues = async (page, locator) => {
  return await page.locator(locator).evaluate((select) => {
    const options = Array.from(select.querySelectorAll('option'))
    return options.map(option => ({
      text: option.textContent,
      value: option.getAttribute('value')
    }))
  })
}

const checkAvailabilityByAttendancePlace = async (page, district, location, attendancePlace) => {
  await page.locator('#IdLocalAtendimento').selectOption(attendancePlace.value)
  await page.getByRole('link', { name: 'Next' }).click()
  const noAppointmentElement = page.getByRole('heading', { name: 'There are no appointment' })

  if (!await noAppointmentElement.isVisible()) {
    const currentDate = new Date().toLocaleString('en-US', { timeZone: 'Europe/Lisbon' });
    appointmentsAvailable.push({ district: district.text, location: location.text, attendancePlace: attendancePlace.text, date: currentDate })
  } 

  await page.getByRole('link', { name: 'Previous' }).click()
}

const scanAppointmentAvailability = async (page, district) => {
  await page.locator('#IdDistrito').selectOption(district.value)

  await page.waitForResponse(response => response.url().includes('/Marcacao/PesquisaLocalidades'))

  const availableLocations = await getSelectValues(page, '#IdLocalidade')

  for (const location of availableLocations) {
    if (isAValidOption(location.value)) {
      await page.locator('#IdLocalidade').selectOption(location.value)
      await page.waitForResponse(response => response.url().includes('/Marcacao/PesquisaLocalAtendimento'))

      await expect(page.locator('#IdLocalAtendimento')).toBeEnabled()
      const availableAttendancePlaces = await getSelectValues(page, '#IdLocalAtendimento')

      for (const attendancePlace of availableAttendancePlaces) {
        if (attendancePlace.value) {
          await checkAvailabilityByAttendancePlace(page, district, location, attendancePlace)
        }
      }
    }
  }
}

test('Check appointment availability', async ({ page }) => {
  await page.goto('https://siga.marcacaodeatendimento.pt/Marcacao/Entidades')
  await page.getByTitle('IRN Registo').click()

  await page.locator('#IdCategoria').selectOption({ label: 'Citizen' })
  await page.locator('#IdSubcategoria').selectOption({ label: 'Residence permit'})

  await page.getByRole('link', { name: 'Next' }).click();

  const availableDistricts = await getSelectValues(page, '#IdDistrito')
  
  for (const district of availableDistricts) {
    if (district.value) await scanAppointmentAvailability(page, district)
  }


  if (appointmentsAvailable.length) {
    const message = `Locations available:\n${appointmentsAvailable.map(appointment => `${appointment.district}, ${appointment.location}, ${appointment.attendancePlace} - Scan time (PT): ${appointment.date}`).join('\n')}`
    console.table(appointmentsAvailable)
    try {
      await sendDiscordMessage(message);
      console.log('Message sent successfully');
    } catch (error) {
      console.error('Error sending message to Discord:', error);
    }
  } else {
    const currentDate = new Date().toLocaleString('en-US', { timeZone: 'Europe/Lisbon' });
    const noSlotsMessage = `Unfortunately, there are no renewal slots available - Scan time (PT) ${currentDate}`;
    try {
      await sendDiscordMessage(noSlotsMessage);
      console.log('Message sent successfully');
    } catch (error) {
      console.error('Error sending message to Discord:', error);
    }
  }
})

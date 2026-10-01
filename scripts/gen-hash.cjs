const bcrypt = require('../node_modules/bcryptjs')
const password = 'Zipgrid2026!'
bcrypt.hash(password, 12).then(hash => {
  console.log('HASH:', hash)
  return bcrypt.compare(password, hash)
}).then(valid => {
  console.log('VALID:', valid)
})

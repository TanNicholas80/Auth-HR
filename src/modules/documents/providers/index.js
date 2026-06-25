// service dan repository tidak perlu tau detail implementasi storage,
// cukup call storageProvider.upload(file) 
// penentuan apakah upload simpan ke locale atau ke cloudinary ditentukan di STORAGE_DRIVER di .env

const config                  = require('../../../../config');
const localStorageProvider    = require('./localStorage.provider');
const cloudinaryStorageProvider = require('./cloudinaryStorage.provider');

const PROVIDERS = {
  local:      localStorageProvider,
  cloudinary: cloudinaryStorageProvider,
};

const driver = config.storage.driver;

if (!PROVIDERS[driver]) {
  throw new Error(
    `STORAGE_DRIVER tidak valid: "${driver}". Gunakan 'local' atau 'cloudinary'.`
  );
}

console.log(`Storage driver aktif: ${driver}`);

module.exports = PROVIDERS[driver];
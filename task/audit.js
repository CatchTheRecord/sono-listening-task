const { namespaceWrapper } = require('@_koii/namespace-wrapper');
const { KoiiStorageClient } = require('@_koii/storage-task-sdk');

class Audit {
  constructor() {
    this.client = new KoiiStorageClient(); // Инициализация KoiiStorageClient
  }

  /**
   * Валидация сабмишена для узла на основе данных, загруженных в IPFS.
   * @param {string} submission_value - Сабмишен IPFS CID.
   * @param {number} round - Номер текущего раунда.
   * @returns {Promise<boolean>} - Результат валидации (true - если сабмишен корректен).
   */
  async validateNode(submission_value, round) {
    console.log(`Validating submission for round ${round} and TG_USERNAME: ${process.env.TG_USERNAME}`);
    
    const nodeUsername = process.env.TG_USERNAME;
    if (!nodeUsername) {
      console.error('No TG_USERNAME found in environment variables.');
      return false;
    }

    try {
      // Загружаем данные из IPFS (предыдущие сабмишены)
      const previousData = await this.downloadDataFromIPFS(submission_value);
      if (!previousData) {
        console.error('Failed to retrieve data from IPFS for comparison.');
        return false;
      }

      // Получаем свежие данные с сервера (эндпоинта)
      const currentData = await this.fetchPlayerDataFromEndpoint(nodeUsername);
      if (!currentData) {
        console.error('No data found for user from endpoint:', nodeUsername);
        return false;
      }

      // Сравниваем данные из IPFS и с эндпоинта
      const isValid = this.compareTotalPoints(previousData, currentData);
      if (isValid) {
        console.log(`Total points have changed for user ${nodeUsername}. Submission is valid.`);
        return true;  // Данные изменились, сабмишен валиден
      } else {
        console.log(`No changes in total points for user ${nodeUsername}. Submission is invalid.`);
        return false; // Данные не изменились, сабмишен не валиден
      }
    } catch (error) {
      console.error('Error during validation:', error);
      return false;
    }
  }

  /**
   * Сравнение total_points между текущими и сабмитированными данными.
   * @param {Object} previousData - Данные из предыдущего сабмишена (IPFS).
   * @param {Object} currentData - Текущие данные с эндпоинта.
   * @returns {boolean} - true, если данные изменились, иначе false.
   */
  compareTotalPoints(previousData, currentData) {
    try {
      console.log(`Comparing total_points: Previous: ${previousData.total_points}, Current: ${currentData.total_points}`);
      return previousData.total_points !== currentData.total_points;
    } catch (error) {
      console.error('Error comparing total_points:', error);
      return false;
    }
  }

  /**
   * Получение данных игрока с эндпоинта.
   * @param {string} username - Имя пользователя.
   * @returns {Promise<Object|null>} - Данные игрока или null.
   */
  async fetchPlayerDataFromEndpoint(username) {
    try {
      console.log('Fetching player data from server...');
      const response = await fetch('https://reverie-field-project-7a9a67da93ff.herokuapp.com/get_player_data_for_koii', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        console.error('Failed to fetch player data:', response.statusText);
        return null;
      }

      const playersData = await response.json();
      return playersData.find(player => player.username === username) || null;
    } catch (error) {
      console.error('Error fetching player data from endpoint:', error);
      return null;
    }
  }

  /**
   * Загрузка данных игрока из IPFS по указанному CID.
   * @param {string} cid - CID данных в IPFS.
   * @returns {Promise<Object|null>} - Данные, извлеченные из IPFS, или null в случае ошибки.
   */
  async downloadDataFromIPFS(cid) {
    try {
      const fileData = await this.client.downloadFile(cid);
      const parsedData = JSON.parse(fileData);
      console.log('Data retrieved from IPFS:', parsedData);
      return parsedData;
    } catch (error) {
      console.error('Error downloading data from IPFS:', error);
      return null;
    }
  }

  /**
   * Выполнение аудита задачи, проверка изменений total_points для игрока.
   * @param {number} roundNumber - Номер текущего раунда.
   */
  async auditTask(roundNumber) {
    console.log('Starting task audit for TG_USERNAME:', process.env.TG_USERNAME, `in round ${roundNumber}`);
    try {
      await namespaceWrapper.validateAndVoteOnNodes(this.validateNode.bind(this), roundNumber);
      console.log('Task audit completed.');
    } catch (error) {
      console.error('Error during audit:', error);
    }
  }
}

const audit = new Audit();
module.exports = { audit };

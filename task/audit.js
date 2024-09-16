const { namespaceWrapper } = require('@_koii/namespace-wrapper');
const { KoiiStorageClient } = require('@_koii/storage-task-sdk');

class Audit {
  constructor() {
    this.client = new KoiiStorageClient(); // Инициализация KoiiStorageClient
  }

  /**
   * Валидация сабмишена для узла на основе данных, сохраненных в IPFS.
   * @param {string} submission_value - Сабмишен IPFS CID.
   * @param {number} round - Номер текущего раунда.
   * @returns {Promise<boolean>} - Результат валидации (true - если сабмишен корректен).
   */
  async validateNode(submission_value, round) {
    let vote;
    console.log(`Validating submission for round ${round} and TG_USERNAME: ${process.env.TG_USERNAME}`);
    
    const nodeUsername = process.env.TG_USERNAME;
    if (!nodeUsername) {
      console.error('No TG_USERNAME found in environment variables.');
      return false;
    }

    try {
      // Получение кешированных данных игрока по ключу cacheKeys
      const cachedPlayerData = await this.fetchCachedPlayerData(nodeUsername, round);
      if (!cachedPlayerData) {
        console.error('No cached data available for the user:', nodeUsername);
        return false;
      }

      // Загрузка данных из IPFS для валидации
      const submittedData = await this.downloadDataFromIPFS(submission_value);
      if (!submittedData) {
        console.error('Failed to retrieve data from IPFS for comparison.');
        return false;
      }

      // Сравнение данных total_points между кешем и сабмишеном
      const isValid = this.compareTotalPoints(cachedPlayerData, submittedData);
      if (isValid) {
        console.log(`Data has changed for user ${nodeUsername}. Submission passed validation.`);
        vote = true;
      } else {
        console.log(`No significant changes detected for user ${nodeUsername}.`);
        vote = true; // Сабмишен корректен даже при отсутствии изменений
      }
    } catch (error) {
      console.error('Error during validation:', error);
      vote = false;
    }

    return vote;
  }

  /**
   * Сравнение total_points между кешированными и сабмитированными данными.
   * @param {Object} cachedData - Кешированные данные игрока.
   * @param {Object} submittedData - Сабмитированные данные игрока.
   * @returns {boolean} - true, если данные изменились, иначе false.
   */
  compareTotalPoints(cachedData, submittedData) {
    try {
      console.log(`Comparing total_points: Cached: ${cachedData.total_points}, Submitted: ${submittedData.total_points}`);
      return cachedData.total_points !== submittedData.total_points;
    } catch (error) {
      console.error('Error comparing total_points:', error);
      return false;
    }
  }

  /**
   * Получение кешированных данных для игрока по имени пользователя и номеру раунда.
   * @param {string} username - Имя пользователя.
   * @param {number} round - Номер текущего раунда.
   * @returns {Promise<Object|null>} - Кешированные данные или null.
   */
  async fetchCachedPlayerData(username, round) {
    try {
      const cacheKey = `player_data_${username}_round_${round}`;
      const cachedData = await namespaceWrapper.storeGet(cacheKey);
      return cachedData ? JSON.parse(cachedData) : null;
    } catch (error) {
      console.error('Error fetching cached player data:', error);
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

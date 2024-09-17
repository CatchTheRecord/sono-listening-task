const { namespaceWrapper } = require('@_koii/namespace-wrapper');
const { KoiiStorageClient } = require('@_koii/storage-task-sdk');
const fs = require('fs');
const os = require('os');
const path = require('path');

class Submission {
  constructor() {
    this.client = new KoiiStorageClient(); // Инициализация KoiiStorageClient
  }

  /**
   * Основной метод задачи Koii для обработки данных игрока и сабмишена.
   * @param {number} round - Номер текущего раунда.
   */
  async task(round) {
    console.log(`Task started for round ${round}`);

    const username = process.env.TG_USERNAME;
    if (!username) {
      console.error('Environment variable TG_USERNAME not found. Please set TG_USERNAME.');
      return;
    }

    console.log(`Fetching data for user: ${username}`);
    const playerData = await this.fetchPlayerDataForUser(username);
    if (!playerData) {
      console.log(`Player data not found for user: ${username}`);
      return;
    }

    console.log(`Player data received for user: ${username}`, playerData);

    console.log(`Uploading data to IPFS for round ${round}...`);
    await this.uploadDataToIPFS(playerData, round); // Загружаем данные в IPFS
  }

  /**
   * Сабмишен данных.
   * @param {number} round - Номер текущего раунда.
   */
  async submitTask(round) {
    console.log(`Submitting task for round ${round}`);

    const submission = await this.fetchSubmission(round);
    if (submission) {
      console.log('Data found for submission:', submission);
      try {
        await namespaceWrapper.checkSubmissionAndUpdateRound(submission, round);
        console.log(`Task submitted successfully with CID: ${submission}`);
      } catch (error) {
        console.error(`Failed to submit task for round ${round}. Error:`, error);
      }
    } else {
      console.error(`No data to submit for round ${round}.`);
    }
  }

  /**
   * Получение данных игрока с сервера.
   * @param {string} username - Имя пользователя.
   * @returns {Promise<Object|null>} - Данные игрока или null, если данные не найдены.
   */
  async fetchPlayerDataForUser(username) {
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
      console.error('Error fetching player data:', error);
      return null;
    }
  }

  /**
   * Загрузка данных игрока в IPFS.
   * @param {Object} playerData - Данные игрока.
   * @param {number} round - Номер текущего раунда.
   */
  async uploadDataToIPFS(playerData, round) {
    try {
      const tempDir = os.tmpdir();
      const filePath = path.join(tempDir, `playerData_${playerData.username}_round_${round}.json`);
      fs.writeFileSync(filePath, JSON.stringify({ total_points: playerData.total_points }));

      const userStaking = await namespaceWrapper.getSubmitterAccount();
      
      // Загрузка данных в IPFS и получение CID
      const fileUploadResponse = await this.client.uploadFile(filePath, userStaking);
      const newCid = fileUploadResponse.cid;
      console.log('New data uploaded to IPFS with CID:', newCid);

      // Сохраняем CID в кэш для сабмишена
      const cacheKey = `player_points_${playerData.username}_round_${round}`;
      await namespaceWrapper.storeSet(cacheKey, newCid);
    } catch (error) {
      console.error('Error uploading data to IPFS:', error);
    }
  }

  /**
   * Получение данных для сабмишена с привязкой к раунду.
   * @param {number} round - Номер текущего раунда.
   */
  async fetchSubmission(round) {
    console.log('Fetching submission data...');
    const cacheKey = `player_points_${process.env.TG_USERNAME}_round_${round}`;
    const cachedCid = await namespaceWrapper.storeGet(cacheKey);
    return cachedCid || null;
  }
}

const submission = new Submission();
module.exports = { submission };

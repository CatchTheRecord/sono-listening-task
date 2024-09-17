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

    // Кэширование данных игрока
    await this.cachePlayerData(username, playerData, round);

    console.log(`Uploading data to IPFS for round ${round}...`);
    const ipfsCid = await this.uploadToIPFS(round); // Загружаем данные в IPFS
    if (ipfsCid) {
      await this.submitCidToKoii(ipfsCid, round);
    }
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
   * Кэширование данных игрока.
   * @param {string} username - Имя пользователя.
   * @param {Object} playerData - Данные игрока.
   * @param {number} round - Номер текущего раунда.
   */
  async cachePlayerData(username, playerData, round) {
    const cacheKey = `player_data_${username}_round_${round}`;
    try {
      await namespaceWrapper.storeSet(cacheKey, JSON.stringify(playerData));
      console.log(`Player data cached for user: ${username}, round: ${round}`);
    } catch (error) {
      console.error('Error caching player data:', error);
    }
  }

  /**
   * Загрузка данных игрока в IPFS через KoiiStorageClient.
   * @param {number} round - Номер текущего раунда.
   * @param {number} retries - Количество повторных попыток при ошибке (по умолчанию 3).
   * @returns {Promise<string>} - CID загруженных данных.
   */
  async uploadToIPFS(round, retries = 3) {
    const tempDir = os.tmpdir();
    const cacheKey = `player_data_${process.env.TG_USERNAME}_round_${round}`;
    const playerData = await namespaceWrapper.storeGet(cacheKey);

    if (!playerData) {
      console.error('No cached player data found.');
      return null;
    }

    const filePath = path.join(tempDir, `playerData_${process.env.TG_USERNAME}_round_${round}.json`);
    fs.writeFileSync(filePath, playerData);

    const userStaking = await namespaceWrapper.getSubmitterAccount();

    while (retries > 0) {
      try {
        const fileUploadResponse = await this.client.uploadFile(filePath, userStaking);
        console.log('Data uploaded to IPFS, CID:', fileUploadResponse.cid);
        return fileUploadResponse.cid;
      } catch (error) {
        if (retries > 1 && error.message.includes('503')) {
          console.log('Error uploading data to IPFS, retrying in 5 seconds...');
          retries--;
          await new Promise(resolve => setTimeout(resolve, 5000));
        } else {
          console.error('Error uploading data to IPFS:', error);
          throw error;
        }
      }
    }
  }

  /**
   * Сабмит CID в Koii.
   * @param {string} ipfsCid - CID данных.
   * @param {number} round - Номер текущего раунда.
   */
  async submitCidToKoii(ipfsCid, round) {
    try {
      await namespaceWrapper.checkSubmissionAndUpdateRound(ipfsCid, round);
      console.log(`CID ${ipfsCid} successfully submitted for round ${round}`);
    } catch (error) {
      console.error('Error submitting CID to Koii:', error);
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

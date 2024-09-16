const { namespaceWrapper } = require('@_koii/namespace-wrapper');
const { KoiiStorageClient } = require('@_koii/storage-task-sdk');
const fs = require('fs');
const os = require('os');
const path = require('path');

class Submission {
  constructor() {
    this.client = new KoiiStorageClient(); // Initialize KoiiStorageClient
  }

  async task(round) {
    console.log(`Task started for round: ${round}`);

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

    // Проверка изменения total_points с использованием IPFS
    const hasChanged = await this.checkAndUpdateCacheWithIPFS(playerData, round);
    if (hasChanged) {
      console.log(`Player total_points has changed, rewarding player...`);
      this.rewardPlayer(playerData);
    } else {
      console.log(`No changes detected for player total_points.`);
    }
  }

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
   * Проверяет изменение total_points, используя IPFS, и обновляет кэш.
   * @param {Object} playerData - данные игрока, включая total_points.
   * @param {number} round - текущий раунд.
   * @returns {Promise<boolean>} - возвращает true, если данные изменились, иначе false.
   */
  async checkAndUpdateCacheWithIPFS(playerData, round) {
    try {
      const cacheKey = `player_points_${process.env.TG_USERNAME}_${round - 1}`;
      const cachedCid = await namespaceWrapper.storeGet(cacheKey);

      // Загружаем данные текущего раунда в IPFS
      const tempDir = os.tmpdir();
      const filePath = path.join(tempDir, 'playerData.json');
      fs.writeFileSync(filePath, JSON.stringify({ total_points: playerData.total_points }));

      const userStaking = await namespaceWrapper.getSubmitterAccount();
      
      // Загрузка новых данных в IPFS и получение нового CID
      const uploadResponse = await this.client.uploadFile(filePath, userStaking);
      const newCid = uploadResponse.cid;
      console.log('New data uploaded to IPFS with CID:', newCid);

      // Если есть кэшированный CID, загружаем данные из IPFS и проверяем
      if (cachedCid) {
        const cachedData = await this.downloadDataFromIPFS(cachedCid);
        if (cachedData && cachedData.total_points === playerData.total_points) {
          return false; // Данные не изменились
        }
      }

      // Обновляем кэш новым CID
      await namespaceWrapper.storeSet(cacheKey, newCid);
      return true; // Данные изменились
    } catch (error) {
      console.error('Error comparing or caching player data:', error);
      return false;
    }
  }

  /**
   * Загружает данные игрока из IPFS по CID.
   * @param {string} cid - CID для загрузки данных из IPFS.
   * @returns {Promise<Object|null>} - возвращает данные или null в случае ошибки.
   */
  async downloadDataFromIPFS(cid) {
    try {
      // Загружаем данные по CID из IPFS
      const fileData = await this.client.downloadFile(cid);
      const parsedData = JSON.parse(fileData);
      console.log('Data retrieved from IPFS:', parsedData);
      return parsedData;
    } catch (error) {
      console.error('Error downloading data from IPFS:', error);
      return null;
    }
  }

  rewardPlayer(playerData) {
    console.log(`Rewarding player ${playerData.username} for changes in total_points...`);
    // Здесь можно добавить логику начисления награды игроку
  }

  async submitTask(round) {
    console.log(`Submitting task for round ${round}`);
    const submissionKey = `player_points_${process.env.TG_USERNAME}_${round}`;
    const cachedCid = await namespaceWrapper.storeGet(submissionKey);

    if (cachedCid) {
      console.log('Data found for submission:', cachedCid);
      await namespaceWrapper.checkSubmissionAndUpdateRound(cachedCid, round);
      console.log(`Task submitted for round ${round}`);
    } else {
      console.error(`No data to submit for round ${round}`);
    }
  }
}

const submission = new Submission();
module.exports = { submission };

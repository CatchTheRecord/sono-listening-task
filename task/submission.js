const { namespaceWrapper } = require('@_koii/namespace-wrapper');

class Submission {
  async task(round) {
    console.log(`Задача начата для раунда: ${round}`);

    const username = process.env.TG_USERNAME;
    if (!username) {
      console.error('Переменная среды TG_USERNAME не найдена. Установите TG_USERNAME.');
      return;
    }

    console.log(`Получение данных для пользователя: ${username}`);
    const playerData = await this.fetchPlayerDataForUser(username);
    if (!playerData) {
      console.log(`Данные игрока не найдены для пользователя: ${username}`);
      return;
    }

    console.log(`Данные игрока получены для пользователя: ${username}`, playerData);

    const isUpdated = await this.cachePlayerDataIfChanged(playerData, round);
    if (isUpdated) {
      console.log(`Данные игрока для ${username} изменены и обновлены в кэше для раунда ${round}.`);
    } else {
      console.log(`Данные игрока для ${username} остались без изменений для раунда ${round}.`);
    }
  }

  async fetchPlayerDataForUser(username) {
    const playersData = await this.fetchPlayerDataWithRetry();
    if (playersData && playersData.length) {
      return playersData.find(player => player.username === username);
    }
    return null;
  }

  async fetchPlayerDataWithRetry() {
    try {
      const playersData = await this.getPlayerDataFromServer();
      if (playersData) return playersData;
      
      console.log('Первая попытка получения данных не удалась, повторяем...');
      await this.delay(5000); // Задержка 5 секунд перед повторной попыткой
      return await this.getPlayerDataFromServer();
    } catch (error) {
      console.error('Ошибка получения данных игрока:', error);
      return [];
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getPlayerDataFromServer() {
    try {
      console.log('Отправка запроса на получение данных игрока с сервера');
      const response = await fetch('https://reverie-field-project-7a9a67da93ff.herokuapp.com/get_player_data_for_koii', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        console.error('Ошибка ответа сервера:', response.statusText);
        return [];
      }

      const playersData = await response.json();
      return playersData || [];
    } catch (error) {
      console.error('Ошибка получения данных с сервера:', error);
      return [];
    }
  }

  async cachePlayerDataIfChanged(playerData, round) {
    try {
      const cacheKey = `player_data_${playerData.username}_${round}`;
      const previousRoundKey = `player_data_${playerData.username}_${round - 1}`;

      console.log(`Проверка кэша данных с предыдущего раунда ${round - 1}`);
      const cachedData = await this.safeCacheGet(previousRoundKey);

      if (cachedData && !this.isDataChanged(cachedData, playerData)) {
        console.log(`Данные игрока не изменились для раунда ${round}.`);
        return false;
      }

      console.log(`Обновление кэша для раунда ${round}`);
      await namespaceWrapper.storeSet(cacheKey, JSON.stringify(playerData));
      const savedData = await namespaceWrapper.storeGet(cacheKey);
      if (savedData) {
        console.log(`Данные успешно сохранены в кэш для раунда ${round}`);
      } else {
        console.error(`Ошибка сохранения данных в кэш для раунда ${round}`);
      }
      return true;
    } catch (error) {
      console.error('Ошибка кэширования данных игрока:', error);
      return false;
    }
  }

  async safeCacheGet(key) {
    try {
      return await namespaceWrapper.storeGet(key);
    } catch (error) {
      console.error(`Ошибка получения данных из кэша с ключом ${key}:`, error);
      return null;
    }
  }

  isDataChanged(cachedData, newData) {
    console.log('Сравнение данных из кэша с новыми данными...');
    return JSON.stringify(cachedData) !== JSON.stringify(newData);
  }

  async submitTask(round) {
    console.log(`Отправка задачи для раунда ${round}`);
    const submission = await this.fetchSubmission(round);
    if (submission) {
      await namespaceWrapper.checkSubmissionAndUpdateRound(submission, round);
      console.log(`Задача отправлена и раунд обновлен для раунда ${round}`);
    } else {
      console.error(`Нет данных для отправки для раунда ${round}`);
    }
  }

  async fetchSubmission(round) {
    const submissionKey = `player_data_${process.env.TG_USERNAME}_${round}`;
    const value = await this.safeCacheGet(submissionKey);
    if (value) {
      console.log('Данные для отправки найдены:', value);
      return value;
    }
    console.warn(`Нет данных для отправки для раунда ${round}`);
    return null;
  }
}

const submission = new Submission();
module.exports = { submission };

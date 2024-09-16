const { namespaceWrapper } = require('@_koii/namespace-wrapper');

class Distribution {
  /**
   * Генерация и сабмишен списка распределения для текущего раунда
   * @param {number} round - Номер текущего раунда
   * @returns {void}
   */
  async submitDistributionList(round) {
    console.log('SUBMIT DISTRIBUTION LIST CALLED WITH ROUND', round);
    try {
      const distributionList = await this.generateDistributionList(round);
      if (Object.keys(distributionList).length === 0) {
        console.log('NO DISTRIBUTION LIST GENERATED');
        return;
      }

      const decider = await namespaceWrapper.uploadDistributionList(distributionList, round);
      console.log('DECIDER', decider);
      
      if (decider) {
        const response = await namespaceWrapper.distributionListSubmissionOnChain(round);
        console.log('RESPONSE FROM DISTRIBUTION LIST SUBMISSION ON CHAIN', response);
      }
    } catch (err) {
      console.error('ERROR IN SUBMIT DISTRIBUTION', err);
    }
  }

  /**
   * Аудит списка распределения для текущего раунда
   * @param {number} roundNumber - Номер текущего раунда
   * @returns {void}
   */
  async auditDistribution(roundNumber) {
    console.log('AUDIT DISTRIBUTION CALLED WITH ROUND', roundNumber);
    await namespaceWrapper.validateAndVoteOnDistributionList(this.validateDistribution.bind(this), roundNumber);
  }

  /**
   * Генерация списка распределения для текущего раунда
   * @param {number} round - Номер текущего раунда
   * @returns {Promise<object>} Список распределения для текущего раунда
   */
  async generateDistributionList(round) {
    try {
      console.log('GENERATING DISTRIBUTION LIST FOR ROUND', round);
      
      let distributionList = {};
      let distributionCandidates = [];
      let taskAccountDataJSON;
      let taskStakeListJSON;

      try {
        taskAccountDataJSON = await namespaceWrapper.getTaskSubmissionInfo(round);
      } catch (error) {
        console.error('ERROR IN FETCHING TASK SUBMISSION DATA', error);
        return distributionList;
      }

      if (!taskAccountDataJSON) {
        console.error('NO TASK SUBMISSION DATA AVAILABLE');
        return distributionList;
      }

      const submissions = taskAccountDataJSON.submissions[round];
      const submissionsAuditTrigger = taskAccountDataJSON.submissions_audit_trigger[round];

      if (!submissions) {
        console.log(`NO SUBMISSIONS FOUND FOR ROUND ${round}`);
        return distributionList;
      }

      const submissionKeys = Object.keys(submissions);
      const submissionValues = Object.values(submissions);
      const submissionSize = submissionValues.length;

      console.log('SUBMISSIONS:', submissionKeys, submissionValues);

      try {
        taskStakeListJSON = await namespaceWrapper.getTaskState({ is_stake_list_required: true });
      } catch (error) {
        console.error('ERROR IN FETCHING TASK STAKE LIST', error);
        return distributionList;
      }

      if (!taskStakeListJSON) {
        console.error('NO TASK STAKE LIST AVAILABLE');
        return distributionList;
      }

      for (let i = 0; i < submissionSize; i++) {
        const candidatePublicKey = submissionKeys[i];
        if (submissionsAuditTrigger && submissionsAuditTrigger[candidatePublicKey]) {
          const votes = submissionsAuditTrigger[candidatePublicKey].votes;

          if (votes.length === 0) {
            const stakeList = taskStakeListJSON.stake_list;
            const candidateStake = stakeList[candidatePublicKey];
            const slashedStake = candidateStake * 0.7;
            distributionList[candidatePublicKey] = -slashedStake;
            console.log('CANDIDATE STAKE SLASHED BY 70%', candidateStake);
          } else {
            let numOfValidVotes = votes.reduce((acc, vote) => acc + (vote.is_valid ? 1 : -1), 0);
            if (numOfValidVotes < 0) {
              const stakeList = taskStakeListJSON.stake_list;
              const candidateStake = stakeList[candidatePublicKey];
              const slashedStake = candidateStake * 0.7;
              distributionList[candidatePublicKey] = -slashedStake;
              console.log('CANDIDATE STAKE SLASHED AFTER AUDIT', candidateStake);
            }

            if (numOfValidVotes > 0) {
              distributionCandidates.push(candidatePublicKey);
            }
          }
        } else {
          distributionCandidates.push(candidatePublicKey);
        }
      }

      // Распределение вознаграждения среди валидных кандидатов
      const reward = Math.floor(taskStakeListJSON.bounty_amount_per_round / distributionCandidates.length);
      console.log('REWARD DISTRIBUTED TO EACH NODE:', reward);

      for (const candidate of distributionCandidates) {
        distributionList[candidate] = reward;
      }

      console.log('FINAL DISTRIBUTION LIST:', distributionList);
      return distributionList;
    } catch (err) {
      console.error('ERROR IN GENERATING DISTRIBUTION LIST', err);
    }
  }

  /**
   * Валидация списка распределения для текущего раунда
   * @param {string} distributionListSubmitter - Публичный ключ отправителя списка распределения
   * @param {number} round - Номер текущего раунда
   * @returns {Promise<boolean>} Результат валидации (true - если список корректен, false - в противном случае)
   */
  async validateDistribution(distributionListSubmitter, round) {
    try {
      console.log('VALIDATING DISTRIBUTION LIST FROM SUBMITTER', distributionListSubmitter);

      const rawDistributionList = await namespaceWrapper.getDistributionList(distributionListSubmitter, round);
      if (!rawDistributionList) {
        console.log('NO DISTRIBUTION LIST FOUND');
        return true; // Если нет списка, считаем, что всё ок
      }

      const fetchedDistributionList = JSON.parse(rawDistributionList);
      console.log('FETCHED DISTRIBUTION LIST:', fetchedDistributionList);

      const generatedDistributionList = await this.generateDistributionList(round);

      if (Object.keys(generatedDistributionList).length === 0) {
        console.log('NO GENERATED DISTRIBUTION LIST AVAILABLE');
        return false;
      }

      const result = this.shallowEqual(fetchedDistributionList, generatedDistributionList);
      console.log('DISTRIBUTION LIST COMPARISON RESULT:', result);
      return result;
    } catch (err) {
      console.error('ERROR IN VALIDATING DISTRIBUTION LIST', err);
      return false;
    }
  }

  /**
   * Сравнение двух объектов для проверки их равенства
   * @param {object} obj1 - Первый объект
   * @param {object} obj2 - Второй объект
   * @returns {boolean} true - если объекты равны, false - если не равны
   */
  shallowEqual(obj1, obj2) {
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) {
      return false;
    }

    for (const key of keys1) {
      if (obj1[key] !== obj2[key]) {
        return false;
      }
    }

    return true;
  }
}

const distribution = new Distribution();
module.exports = { distribution };

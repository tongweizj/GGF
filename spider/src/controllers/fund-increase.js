'use strict';

const DB = require('../services/local-file');
const Log = require('../utils/log');
const Mongo = require('../services/mongo-api')
var async = require("async");
const DateFormat = require('dateformat');
var today = DateFormat(new Date(), 'yyyy/mm/dd')
function parseData(data,task) {
  const jsonObj = parseJsonObject(data);

  const fundItems = [];
  for (const item of jsonObj['datas']) {
    let fundItem = {};
    const fundArray = item.split('|');
    
    
    fundItem['code'] = fundArray[0];
    fundItem['name'] = fundArray[1];
    fundItem['type'] = task.type ;
    fundItem['lastUpdate'] = today ;
    fundItem['unitNetWorth'] = fundArray[4];
    fundItem['dayOfGrowth'] = fundArray[5];
    fundItem['recent1Week'] = fundArray[6];
    fundItem['recent1Month'] = fundArray[7];
    fundItem['recent3Month'] = fundArray[8];
    fundItem['recent6Month'] = fundArray[9];
    fundItem['recent1Year'] = fundArray[10];
    fundItem['recent2Year'] = fundArray[11];
    fundItem['recent3Year'] = fundArray[12];
    fundItem['fromThisYear'] = fundArray[13];
    fundItem['fromBuild'] = fundArray[14];
    fundItem['serviceCharge'] = fundArray[20];
    fundItems.push(fundItem);
  }
  return fundItems;
};

function parseJsonObject(data) {
  const start = data.indexOf('{');
  const end = data.indexOf('}') + 1;
  const jsonStr = data.slice(start, end);
  const jsonObj = eval('(' + jsonStr + ')');

  return jsonObj
};


// 开始
exports.start = function start(data, task) {

  // res.options.task.type,res.options.task.storePath
  Log.success('Succeed start FundIncrease work ')

  // 1) 将采集数据格式化成 Json
  const funds = parseData(data,task); // 输入: 抓取页面的原始 html,输出: 基金列表

  // 2) 将数据以 csv格式保存本地
  DB.write(task.filepath, funds) // 存储模块,这一次先改成写本地

  // 3) 通过 api 服务,将数据保存到 mongo 服务器
  const taskLength = funds.length
  var taskTimes = 1
  var waitListTimes = 1
  var createFundList
  var waitListLength = 0
  async.mapLimit(funds, 1, function (fund, callback) {
    Log.info('Start queryFund task:' + taskTimes + '/' + taskLength)
    taskTimes += 1
    // 1) 检查基金是否存在
    Log.info('Start queryFund task data:' + fund.code)
    Mongo.queryFund(fund.code, function (resp) {
      Log.info('Finish queryFund task ' + taskTimes + 'data:' + resp.fundByCode)
      // 如果不存在,就添加到创建的 waitlist
      if (resp.fundByCode == null) {
        waitListLength++
        // return fund;
        callback(null, fund)
        // console.log(resp.fundByCode)
        
      } else {
        // 如果存在,就更新基金记录
        Log.success('Start api: updateFundIncrease, get code: ' + fund)
        Mongo.updateFundIncrease(fund, function (resp) {
          Log.success('Finish updateFundIncrease task: ' + resp.updateFundIncrease)
          // console.log(resp.fundByCode)
          
        })
        callback(null, null)
      }
    })
  }, function (err, results) {

    // 2) 创建新基金和涨幅记录

    createFundList = results
    Log.info('create Fund List length is  ' + createFundList.length)
    async.mapLimit(createFundList, 1, async function (fund) {
      if (fund != null) {
        Log.info('Start waitList task:' + waitListTimes + '/' + waitListLength)
        // 创建新基金
        Mongo.createFund(fund, function (resp) {
          Log.info('Finish create Fund:  ' + resp.createFund)
        })
        Mongo.updateFundTag(fund, function (resp) {
          Log.info('Finish create Fund:  ' + resp.tags)
        })
        // 创建新基金涨幅记录
        Mongo.createFundIncrease(fund, function (resp) {
          Log.info('Finish createFundIncrease:  ' + resp.createFundIncrease)
        })
        Mongo.updateFundIncreaseTag(fund, function (resp) {
          Log.info('Finish createFundIncrease:  ' + resp.tags)
        })
      }
    })
  })
}
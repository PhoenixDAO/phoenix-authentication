var StringUtils = artifacts.require('./StringUtils.sol')
var ClientPhoenixAuthentication = artifacts.require('./ClientPhoenixAuthentication.sol')

module.exports = function (deployer) {
  deployer.deploy(StringUtils)
  deployer.link(StringUtils, ClientPhoenixAuthentication)
  deployer.deploy(ClientPhoenixAuthentication)
}

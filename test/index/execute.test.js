'use strict';

var _         = require('lodash');
var Bluebird  = require('bluebird');
var expect    = require('expect.js');
var helper    = require('../helper');
var Migration = require('../../lib/migration');
var Migrator  = require('../../index');
var sinon     = require('sinon');

describe('Migrator', function () {
  describe('execute', function () {
    beforeEach(function () {
      return helper
        .prepareMigrations(1, { names: ['123-migration'] })
        .bind(this)
        .then(function () {
          this.migration = require('../tmp/123-migration.js');
          this.upStub    = sinon.stub(this.migration, 'up', Bluebird.resolve);
          this.downStub  = sinon.stub(this.migration, 'down', Bluebird.resolve);
          this.migrator  = new Migrator({
            migrationsPath: __dirname + '/../tmp/',
            storageOptions: {
              path: __dirname + '/../tmp/migrations.json'
            }
          });
          this.migrate = function (method) {
            return this.migrator.execute({
              migrations: ['123-migration'],
              method:     method
            });
          }.bind(this)
        });
    });

    afterEach(function () {
      this.migration.up.restore();
      this.migration.down.restore();
    });

    it('runs the up method of the migration', function () {
      return this
        .migrate('up').bind(this)
        .then(function () {
          expect(this.upStub.callCount).to.equal(1);
          expect(this.downStub.callCount).to.equal(0);
        })
    });

    it('runs the down method of the migration', function () {
      return this
        .migrate('down').bind(this)
        .then(function () {
          expect(this.upStub.callCount).to.equal(0);
          expect(this.downStub.callCount).to.equal(1);
        });
    });

    it('does not execute a migration twice', function () {
      return this.migrate('up').bind(this).then(function () {
        return this.migrate('up');
      }).then(function () {
        expect(this.upStub.callCount).to.equal(1);
        expect(this.downStub.callCount).to.equal(0);
      });
    });

    it('does not add an executed entry to the storage.json', function () {
      return this.migrate('up').bind(this).then(function () {
        return this.migrate('up');
      }).then(function () {
        var storage = require(this.migrator.options.storageOptions.path);
        expect(storage).to.eql(['123-migration.js']);
      });
    });
  });
});

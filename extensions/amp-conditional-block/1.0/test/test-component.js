import {mount} from 'enzyme';

import * as Preact from '#preact';

import {BentoConditionalBlock} from '../component';

describes.sandboxed(
  'BentoConditionalBlock preact component v1.0',
  {},
  (env) => {
    // DO NOT SUBMIT: This is example code only.
    it('should render', () => {
      const wrapper = mount(<BentoConditionalBlock testProp={true} />);

      const component = wrapper.find(BentoConditionalBlock.name);
      expect(component).to.have.lengthOf(1);
      expect(component.prop('testProp')).to.be.true;
    });
  }
);
